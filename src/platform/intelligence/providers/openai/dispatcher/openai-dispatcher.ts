/**
 * OpenAI runtime dispatcher — adapter → SDK → normalize → response.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asProviderId } from "../../../shared/identifiers";
import type { ProviderId } from "../../../shared/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { OpenAIProviderAdapter } from "../adapters/openai-adapter";
import type { OpenAISdkClient } from "../sdk/openai-sdk-client";
import { mapOpenAIResponseToCanonical } from "../responses/response-mapper";
import type { ProviderAdapterRequest } from "../../adapters/contracts/adapter-io";
import { asProviderAdapterId } from "../../adapters/contracts/identifiers";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";
import {
  extractInputAssets,
  validateInputAssetTenancy,
} from "../../common/input-asset-validator";
import {
  isAudioTranscribeCapability,
  isImageGenerationCapability,
  isVisionCapability,
} from "../../common/resolve-execution-modality";
import { asSdkExecutionId } from "../../sdk/contracts/identifiers";
import {
  OPENAI_ADAPTER_ID,
  OPENAI_PROVIDER_ID,
  OPENAI_VENDOR,
} from "../constants";
import type { OpenAIExecutionArtifacts, OpenAIExecutionMetrics } from "../contracts/openai-contracts";

export class OpenAIDispatcher implements IProviderDispatcher {
  private lastArtifacts?: OpenAIExecutionArtifacts;

  constructor(
    private readonly adapter: OpenAIProviderAdapter,
    private readonly sdk: OpenAISdkClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(providerId: ProviderId): boolean {
    // Legacy catalogue claim — enables buffered dispatchStreaming only.
    // Native incremental SSE requires INativeStreamingDispatcher (M9.5O1).
    return String(providerId) === OPENAI_PROVIDER_ID;
  }

  getLastArtifacts(): OpenAIExecutionArtifacts | undefined {
    return this.lastArtifacts;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const start = this.clockMs();
    const adapterRequest = toAdapterRequest(request, this.nowIso());

    if (
      isVisionCapability(String(request.capabilityId)) ||
      isImageGenerationCapability(String(request.capabilityId)) ||
      isAudioTranscribeCapability(String(request.capabilityId))
    ) {
      const assets = extractInputAssets(request.payload);
      if (assets.length > 0) {
        const tenancy = validateInputAssetTenancy({
          assets,
          organizationId: String(request.context.organizationId),
          workspaceId: String(request.context.workspaceId),
        });
        if (!tenancy.ok) return tenancy;
      }
    }

    const validation = this.adapter.validate(adapterRequest);
    if (!validation.ok) return validation;
    if (!validation.value.valid) {
      return failure(
        new ValidationError(validation.value.issues.map((i) => i.message).join("; "))
      );
    }

    const translated = this.adapter.translateRequest(adapterRequest);
    if (!translated.ok) return translated;

    const sdkResult = await this.sdk.execute(
      {
        requestId: request.requestId,
        providerId: asProviderId(OPENAI_PROVIDER_ID),
        vendor: OPENAI_VENDOR as "openai",
        operation: String(translated.value.value.operation ?? "chat.completions"),
        payload: translated.value.value,
        streaming: request.streaming,
        authentication: this.sdk.asSdkAuth(),
        headers: {},
        metadata: {},
        createdAt: this.nowIso(),
      },
      {
        executionId: asSdkExecutionId(String(request.context.executionId)),
        requestId: request.requestId,
        providerId: asProviderId(OPENAI_PROVIDER_ID),
        vendor: OPENAI_VENDOR as "openai",
        clientId: this.sdk.describe().clientId,
        attributes: {},
        startedAt: this.nowIso(),
      }
    );

    if (!sdkResult.ok) return sdkResult;

    let canonical;
    try {
      // Prefer runtime registry provider id (provider.openai) for embedding provenance.
      const responseRequest = {
        ...adapterRequest,
        providerId: request.providerId,
      };
      canonical = mapOpenAIResponseToCanonical(
        sdkResult.value.payload,
        responseRequest,
        sdkResult.value.statistics.latencyMs ?? this.clockMs() - start,
        this.nowIso()
      );
    } catch (err) {
      if (err instanceof ValidationError) return failure(err);
      return failure(
        new ValidationError(err instanceof Error ? err.message : "OpenAI response mapping failed")
      );
    }

    const metrics: OpenAIExecutionMetrics = {
      latencyMs: canonical.latencyMs ?? 0,
      inputTokens: canonical.usage?.promptTokens,
      outputTokens: canonical.usage?.completionTokens,
      reasoningTokens: canonical.usage?.reasoningTokens,
      totalTokens: canonical.usage?.totalTokens,
      retryCount: sdkResult.value.statistics.retries,
      modelId: canonical.modelId,
      operation: String(translated.value.value.operation ?? "chat.completions"),
    };

    this.lastArtifacts = {
      executionArtifact: {
        requestId: request.requestId,
        providerId: OPENAI_PROVIDER_ID,
        modelId: canonical.modelId,
        output: canonical.output,
        finishReason: canonical.finishReason,
      },
      evaluationArtifactCandidate: {
        requestId: request.requestId,
        overallHint: canonical.finishReason === "stop" ? 1 : 0.5,
      },
      experienceCandidate: {
        providerId: OPENAI_PROVIDER_ID,
        modelId: canonical.modelId,
        success: true,
        latencyMs: metrics.latencyMs,
      },
      providerMetrics: metrics,
      modelMetrics: {
        modelId: canonical.modelId,
        tokens: metrics.totalTokens,
        reasoningTokens: metrics.reasoningTokens,
      },
    };

    return success({
      requestId: request.requestId,
      // Preserve routing-selected provider identity in the runtime response.
      // The leaf still uses the OpenAI wire-provider internally for SDK calls.
      providerId: request.providerId,
      output: canonical.output,
      usage: canonical.usage as Readonly<Record<string, unknown>>,
      providerRequestId: String(sdkResult.value.payload.id ?? ""),
      streamed: request.streaming,
      finishedAt: this.nowIso(),
    });
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    const result = await this.dispatch({ ...request, streaming: true }, token);
    if (result.ok) {
      onChunk({
        sessionId: `sess_${request.requestId}`,
        requestId: request.requestId,
        sequence: 0,
        data: result.value.output,
        done: true,
        receivedAt: this.nowIso(),
      });
    }
    return result;
  }
}

function toAdapterRequest(
  request: ProviderExecutionRequest,
  nowIso: string
): ProviderAdapterRequest {
  return toAdapterRequestFromExecution({
    request,
    canonicalProviderId: OPENAI_PROVIDER_ID,
    adapterId: OPENAI_ADAPTER_ID,
    nowIso,
  });
}
