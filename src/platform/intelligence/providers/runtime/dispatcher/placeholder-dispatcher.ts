/**
 * Placeholder provider dispatcher.
 *
 * Purpose: Satisfy the dispatcher seam without any vendor SDK, HTTP, or network.
 * Responsibilities: Return a deterministic, provider-independent synthetic
 *   response so the runtime lifecycle can complete end-to-end.
 * Usage: Default dispatcher until concrete provider adapters plug in (M4.2+).
 * Future Extension: Replaced by adapters implementing IProviderDispatcher.
 *
 * This is NOT a provider implementation — it performs no external I/O.
 */

import type { ProviderId } from "../../../shared/identifiers";
import { success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { CancellationToken } from "../contracts/cancellation";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type { StreamingChunk } from "../contracts/streaming";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../interfaces/provider-dispatcher";

export interface PlaceholderDispatcherOptions {
  readonly nowIso?: () => string;
  readonly streamingChunks?: number;
}

export class PlaceholderProviderDispatcher implements IProviderDispatcher {
  private readonly nowIso: () => string;
  private readonly streamingChunks: number;

  constructor(options: PlaceholderDispatcherOptions = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.streamingChunks = Math.max(1, options.streamingChunks ?? 2);
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    return success(this.buildResponse(request, false));
  }

  supportsStreaming(_providerId: ProviderId): boolean {
    return true;
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    for (let i = 0; i < this.streamingChunks; i += 1) {
      if (token.cancelled) {
        break;
      }
      const chunk: StreamingChunk = {
        sessionId: request.requestId,
        requestId: request.requestId,
        sequence: i,
        data: { index: i, placeholder: true },
        done: i === this.streamingChunks - 1,
        receivedAt: this.nowIso(),
      };
      onChunk(chunk);
    }
    return success(this.buildResponse(request, true));
  }

  private buildResponse(
    request: ProviderExecutionRequest,
    streamed: boolean
  ): ProviderExecutionResponse {
    return {
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        placeholder: true,
        capabilityId: String(request.capabilityId),
        echoedPayloadKeys: Object.keys(request.payload),
      },
      usage: { placeholder: true },
      providerRequestId: `placeholder_${request.requestId}`,
      streamed,
      finishedAt: this.nowIso(),
    };
  }
}
