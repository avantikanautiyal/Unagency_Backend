/**
 * Sync audio dispatcher — TTS via verified vendor protocols.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { VerifiedAudioProviderSpec } from "../configs/verified-audio-provider-specs";
import type { IVendorAudioProtocol, VendorAudioAuthContext } from "../common/vendor-audio-protocol";
import { resolveVoiceId, resolveWireModelId } from "../common/vendor-audio-protocol";
import type { IAudioHttpClient } from "../http/audio-http-client";
import {
  isAudioSynthesizeCapability,
  normalizeAudioCapabilityId,
} from "../../common/resolve-execution-modality";
import { normalizeAudioUsage } from "../../common/media-output";

export class VendorSyncAudioDispatcher implements IProviderDispatcher {
  constructor(
    private readonly spec: VerifiedAudioProviderSpec,
    private readonly protocol: IVendorAudioProtocol,
    private readonly http: IAudioHttpClient,
    private readonly auth: VendorAudioAuthContext,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
    _onChunk?: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    const cap = normalizeAudioCapabilityId(String(request.capabilityId));
    if (!isAudioSynthesizeCapability(cap)) {
      return failure(
        new ValidationError(
          `${this.spec.displayName} does not support capability '${request.capabilityId}'`
        )
      );
    }

    const wireModelId = resolveWireModelId(request.modelId ?? this.spec.inventoryModelId);
    if (!this.protocol.validateModel(this.spec, wireModelId)) {
      return failure(
        new ValidationError(
          `Model '${request.modelId}' is not supported by ${this.spec.displayName}`
        )
      );
    }

    const voiceId = resolveVoiceId(request.payload, this.spec.defaultVoiceId);
    const plan = this.protocol.buildTtsRequest({
      spec: this.spec,
      request,
      wireModelId,
      voiceId,
    });

    const headers = {
      ...plan.request.headers,
      ...(this.auth.apiKey
        ? this.spec.vendor === "elevenlabs"
          ? { "xi-api-key": this.auth.apiKey }
          : { "X-API-Key": this.auth.apiKey }
        : {}),
    };

    const httpResult = await this.http.send({
      ...plan.request,
      headers,
    });
    if (!httpResult.ok) return httpResult;

    const normalized = this.protocol.normalizeTtsResponse({
      spec: this.spec,
      body: httpResult.value.body,
      headers: httpResult.value.headers,
      inputCharacters: plan.inputCharacters,
    });

    const usage = normalizeAudioUsage(normalized.usage) ?? normalized.usage;

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: normalized.output,
      usage,
      providerRequestId: normalized.providerRequestId,
      streamed: false,
      finishedAt: this.nowIso(),
      statistics: {
        executionMs: httpResult.value.latencyMs,
        streamingMs: 0,
        retries: 0,
      },
    });
  }
}
