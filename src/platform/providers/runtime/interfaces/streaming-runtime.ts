/**
 * Streaming runtime ports.
 *
 * Purpose: Manage streaming sessions and chunk accumulation.
 * Responsibilities: Open/push/close streaming sessions; aggregate chunks.
 * Usage: Used by the execution pipeline during streaming dispatch.
 * Future Extension: SSE / WebSocket / HTTP stream transports.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { StreamingChunk, StreamingSession } from "../contracts/streaming";

export interface IStreamingAccumulator {
  readonly chunks: readonly StreamingChunk[];
  add(chunk: StreamingChunk): void;
  /** Aggregate accumulated chunk data into a single output object. */
  aggregate(): Readonly<Record<string, unknown>>;
}

export interface IStreamingRuntime {
  open(request: ProviderExecutionRequest, sessionId: string): StreamingSession;
  push(sessionId: string, chunk: StreamingChunk): Result<void>;
  close(sessionId: string): Result<StreamingSession>;
  get(sessionId: string): Result<StreamingSession>;
  createAccumulator(): IStreamingAccumulator;
}
