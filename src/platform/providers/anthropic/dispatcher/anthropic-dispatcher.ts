/**
 * Anthropic runtime dispatcher.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import { asProviderId } from "../../../core/identifiers";
import type { ProviderId } from "../../../core/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { ProviderAdapterRequest } from "../../adapters/contracts/adapter-io";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";
import {
  extractInputAssets,
  validateInputAssetTenancy,
} from "../../common/input-asset-validator";
import { isVisionCapability } from "../../common/resolve-execution-modality";
import { asSdkExecutionId } from "../../sdk/contracts/identifiers";
import type { AnthropicProviderAdapter } from "../adapters/anthropic-adapter";
import type { AnthropicSdkClient } from "../sdk/anthropic-sdk-client";
import { mapAnthropicResponseToCanonical } from "../responses/response-mapper";
import {
  ANTHROPIC_ADAPTER_ID,
  ANTHROPIC_PROVIDER_ID,
  ANTHROPIC_VENDOR,
} from "../constants";

export class AnthropicDispatcher implements IProviderDispatcher {
  constructor(
    private readonly adapter: AnthropicProviderAdapter,
    private readonly sdk: AnthropicSdkClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(providerId: ProviderId): boolean {
    return String(providerId) === ANTHROPIC_PROVIDER_ID;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const start = this.clockMs();
    const adapterRequest = toAdapterRequest(request, this.nowIso());

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
        providerId: asProviderId(ANTHROPIC_PROVIDER_ID),
        vendor: ANTHROPIC_VENDOR,
        operation: "messages.create",
        payload: translated.value.value,
        streaming: request.streaming,
        authentication: this.sdk.asSdkAuth(),
        headers: {},
        metadata: {},
        createdAt: this.nowIso(),
        timeoutPolicy: {
          requestTimeoutMs:
            request.timeoutPolicy?.executionTimeoutMs ??
            adapterRequest.timeoutMs ??
            120_000,
        },
      },
      {
        executionId: asSdkExecutionId(String(request.context.executionId)),
        requestId: request.requestId,
        providerId: asProviderId(ANTHROPIC_PROVIDER_ID),
        vendor: ANTHROPIC_VENDOR,
        clientId: this.sdk.describe().clientId,
        attributes: {},
        startedAt: this.nowIso(),
      }
    );

    if (!sdkResult.ok) return sdkResult;

    const canonical = mapAnthropicResponseToCanonical(
      sdkResult.value.payload,
      adapterRequest,
      sdkResult.value.statistics.latencyMs ?? this.clockMs() - start,
      this.nowIso()
    );

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: Object.freeze({
        ...canonical.output,
        finishReason: canonical.finishReason,
      }),
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
    canonicalProviderId: ANTHROPIC_PROVIDER_ID,
    adapterId: ANTHROPIC_ADAPTER_ID,
    nowIso,
  });
}
