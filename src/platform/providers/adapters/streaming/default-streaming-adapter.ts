/**
 * Default streaming adapter.
 *
 * Purpose: Canonicalize streaming chunks + manage stream lifecycle.
 * Responsibilities: open/close streams, normalize chunks, heartbeats, end markers.
 * Usage: Composed by AbstractStreamingProviderAdapter / used directly.
 * Future Extension: Backpressure and resumable streams. No networking.
 */

import { failure, success, type Result } from "../../../core/result";
import type { ProviderWirePayload } from "../contracts/adapter-io";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type {
  ProviderStreamChunk,
  ProviderStreamSession,
} from "../contracts/lifecycle-streaming";
import { AdapterError } from "../errors/adapter-errors";
import type { IStreamingAdapter } from "../interfaces/lifecycle-streaming";

export class DefaultStreamingAdapter implements IStreamingAdapter {
  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) =>
      `${p}_${Math.random().toString(36).slice(2)}`
  ) {}

  openStream(
    requestId: string,
    adapterId: ProviderAdapterId
  ): Result<ProviderStreamSession> {
    const now = this.nowIso();
    const startChunk: ProviderStreamChunk = {
      sessionId: this.createId("stream"),
      requestId,
      sequence: 0,
      kind: "start",
      delta: {},
      done: false,
      receivedAt: now,
    };
    return success({
      sessionId: startChunk.sessionId,
      requestId,
      adapterId,
      chunks: [startChunk],
      startedAt: now,
      active: true,
    });
  }

  normalizeChunk(
    raw: ProviderWirePayload,
    session: ProviderStreamSession
  ): Result<ProviderStreamChunk> {
    if (!session.active) {
      return failure(new AdapterError("stream session is not active", {
        sessionId: session.sessionId,
      }));
    }
    const source = raw as Record<string, unknown>;
    const done = Boolean(source.done ?? source.finished ?? false);
    const delta =
      (source.delta as Record<string, unknown> | undefined) ??
      (source.content !== undefined ? { content: source.content } : {});

    return success({
      sessionId: session.sessionId,
      requestId: session.requestId,
      sequence: session.chunks.length,
      kind: done ? "end" : "chunk",
      delta,
      done,
      receivedAt: this.nowIso(),
    });
  }

  heartbeat(session: ProviderStreamSession): Result<ProviderStreamChunk> {
    if (!session.active) {
      return failure(new AdapterError("stream session is not active", {
        sessionId: session.sessionId,
      }));
    }
    return success({
      sessionId: session.sessionId,
      requestId: session.requestId,
      sequence: session.chunks.length,
      kind: "heartbeat",
      delta: {},
      done: false,
      receivedAt: this.nowIso(),
    });
  }

  closeStream(
    session: ProviderStreamSession
  ): Result<ProviderStreamSession> {
    const now = this.nowIso();
    const endChunk: ProviderStreamChunk = {
      sessionId: session.sessionId,
      requestId: session.requestId,
      sequence: session.chunks.length,
      kind: "end",
      delta: {},
      done: true,
      receivedAt: now,
    };
    return success({
      ...session,
      chunks: [...session.chunks, endChunk],
      completedAt: now,
      active: false,
    });
  }
}
