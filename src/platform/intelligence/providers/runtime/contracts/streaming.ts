/**
 * Streaming contracts.
 *
 * Purpose: Immutable streaming chunk and session shapes.
 * Responsibilities: Describe ordered chunks and their accumulation session.
 * Usage: Produced by streaming dispatch (future SSE/WebSocket/HTTP streams).
 * Future Extension: Backpressure signals and partial-frame decoding.
 */

export interface StreamingChunk {
  readonly sessionId: string;
  readonly requestId: string;
  readonly sequence: number;
  readonly data: Readonly<Record<string, unknown>>;
  readonly done: boolean;
  readonly receivedAt: string;
}

export interface StreamingSession {
  readonly sessionId: string;
  readonly requestId: string;
  readonly chunks: readonly StreamingChunk[];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly active: boolean;
}
