/**
 * Provider dispatcher port.
 *
 * Purpose: Seam between the runtime and provider adapters.
 * Responsibilities: Dispatch a provider-independent request and return a response.
 * Usage: The runtime calls the dispatcher; future adapters plug in here.
 * Future Extension: Vendor adapters (OpenAI/Claude/Gemini) — NOT in this milestone.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type { CancellationToken } from "../contracts/cancellation";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type { StreamingChunk } from "../contracts/streaming";

export type StreamingChunkListener = (chunk: StreamingChunk) => void;

export interface IProviderDispatcher {
  /**
   * Dispatch a request. Implementations must not call vendor SDKs in M4.1.
   */
  dispatch(
    request: ProviderExecutionRequest,
    token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>>;

  /**
   * Whether this dispatcher can stream responses for the given provider.
   */
  supportsStreaming(providerId: ProviderId): boolean;

  /**
   * Dispatch a request in streaming mode, invoking onChunk for each chunk.
   * Optional: only present when supportsStreaming is true.
   */
  dispatchStreaming?(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>>;
}
