/**
 * Native incremental streaming dispatcher port (M9.5O).
 * Distinct from buffered dispatchStreaming wrappers that emit one fake done chunk.
 */

import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderStreamEvent } from "../contracts/provider-stream-event";

export interface NativeStreamContext {
  readonly executionId: string;
  readonly attemptId: string;
  readonly token: CancellationToken;
  /** Linked AbortSignal for HTTP leaves (when wired). */
  readonly abortSignal?: AbortSignal;
}

/**
 * True native incremental streaming — yields real deltas over time.
 * Existing leaf dispatchStreaming that buffers then emits one chunk must NOT
 * implement this interface.
 */
export interface INativeStreamingDispatcher {
  readonly nativeIncrementalStreaming: true;

  supportsNativeStreaming(request: ProviderExecutionRequest): boolean;

  /**
   * Yield provider-neutral stream events. Vendor schemas stay inside the leaf.
   */
  stream(
    request: ProviderExecutionRequest,
    context: NativeStreamContext
  ): AsyncIterable<ProviderStreamEvent>;
}

export function isNativeStreamingDispatcher(
  value: unknown
): value is INativeStreamingDispatcher {
  return (
    !!value &&
    typeof value === "object" &&
    (value as INativeStreamingDispatcher).nativeIncrementalStreaming === true &&
    typeof (value as INativeStreamingDispatcher).stream === "function"
  );
}
