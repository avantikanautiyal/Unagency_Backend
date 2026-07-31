/**
 * OpenAI-compatible text provider dispatcher — adapter → SDK → normalize.
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
import type { ProviderAdapterRequest } from "../../adapters/contracts/adapter-io";
import { asProviderAdapterId } from "../../adapters/contracts/identifiers";
import { asSdkExecutionId } from "../../sdk/contracts/identifiers";
import { mapOpenAIResponseToCanonical } from "../../openai/responses/response-mapper";
import type { CompatTextAdapter } from "../adapters/compat-text-adapter";
import type { CompatSdkClient } from "../sdk/compat-sdk-client";
import type { TextProviderConfig } from "../contracts/text-provider-config";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";
import {
  extractInputAssets,
  validateInputAssetTenancy,
} from "../../common/input-asset-validator";
import { isVisionCapability } from "../../common/resolve-execution-modality";

export class CompatTextDispatcher implements IProviderDispatcher {
  constructor(
    private readonly config: TextProviderConfig,
    private readonly adapter: CompatTextAdapter,
    private readonly sdk: CompatSdkClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(providerId: ProviderId): boolean {
    return (
      String(providerId) === this.config.canonicalProviderId &&
      this.config.streamingCapable
    );
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const start = this.clockMs();
    const adapterRequest = toAdapterRequest(request, this.config, this.nowIso());

    if (isVisionCapability(String(request.capabilityId))) {
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
        providerId: asProviderId(this.config.canonicalProviderId),
        vendor: this.config.vendor,
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
        providerId: asProviderId(this.config.canonicalProviderId),
        vendor: this.config.vendor,
        clientId: this.sdk.describe().clientId,
        attributes: {},
        startedAt: this.nowIso(),
      }
    );

    if (!sdkResult.ok) return sdkResult;

    let canonical;
    try {
      canonical = mapOpenAIResponseToCanonical(
        { ...sdkResult.value.payload, operation: String(translated.value.value.operation ?? "") },
        adapterRequest,
        sdkResult.value.statistics.latencyMs ?? this.clockMs() - start,
        this.nowIso()
      );
    } catch (err) {
      if (err instanceof ValidationError) return failure(err);
      return failure(
        new ValidationError(err instanceof Error ? err.message : "Compat response mapping failed")
      );
    }

    return success({
      requestId: request.requestId,
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
  config: TextProviderConfig,
  nowIso: string
): ProviderAdapterRequest {
  return toAdapterRequestFromExecution({
    request,
    canonicalProviderId: config.canonicalProviderId,
    adapterId: config.adapterId,
    nowIso,
  });
}
