/**
 * Streaming runtime.
 *
 * Purpose: Manage streaming sessions and chunk accumulation.
 * Responsibilities: Open/push/close streaming sessions; aggregate chunks.
 * Usage: Used by the execution pipeline during streaming dispatch.
 * Future Extension: SSE / WebSocket / HTTP stream transports (placeholder only).
 */

import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { StreamingChunk, StreamingSession } from "../contracts/streaming";
import { ProviderRuntimeError } from "../errors";
import type {
  IStreamingAccumulator,
  IStreamingRuntime,
} from "../interfaces/streaming-runtime";

export class StreamingAccumulator implements IStreamingAccumulator {
  private readonly _chunks: StreamingChunk[] = [];

  get chunks(): readonly StreamingChunk[] {
    return [...this._chunks];
  }

  add(chunk: StreamingChunk): void {
    this._chunks.push(chunk);
  }

  aggregate(): Readonly<Record<string, unknown>> {
    const ordered = [...this._chunks].sort((a, b) => a.sequence - b.sequence);
    return {
      chunkCount: ordered.length,
      chunks: ordered.map((c) => c.data),
    };
  }
}

interface MutableStreamingSession {
  readonly sessionId: string;
  readonly requestId: string;
  chunks: StreamingChunk[];
  readonly startedAt: string;
  completedAt?: string;
  active: boolean;
}

export class StreamingRuntime implements IStreamingRuntime {
  private readonly sessions = new Map<string, MutableStreamingSession>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  open(request: ProviderExecutionRequest, sessionId: string): StreamingSession {
    const session: MutableStreamingSession = {
      sessionId,
      requestId: request.requestId,
      chunks: [],
      startedAt: this.nowIso(),
      active: true,
    };
    this.sessions.set(sessionId, session);
    return this.freeze(session);
  }

  push(sessionId: string, chunk: StreamingChunk): Result<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return failure(
        new ProviderRuntimeError("Streaming session not found", { sessionId })
      );
    }
    if (!session.active) {
      return failure(
        new ProviderRuntimeError("Streaming session is closed", { sessionId })
      );
    }
    session.chunks.push(chunk);
    return success(undefined);
  }

  close(sessionId: string): Result<StreamingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return failure(
        new ProviderRuntimeError("Streaming session not found", { sessionId })
      );
    }
    session.active = false;
    session.completedAt = this.nowIso();
    return success(this.freeze(session));
  }

  get(sessionId: string): Result<StreamingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return failure(
        new ProviderRuntimeError("Streaming session not found", { sessionId })
      );
    }
    return success(this.freeze(session));
  }

  createAccumulator(): IStreamingAccumulator {
    return new StreamingAccumulator();
  }

  private freeze(session: MutableStreamingSession): StreamingSession {
    return {
      sessionId: session.sessionId,
      requestId: session.requestId,
      chunks: [...session.chunks],
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      active: session.active,
    };
  }
}
