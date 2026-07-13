/**
 * Default transport streaming engine.
 *
 * Purpose: Canonicalize streaming into transport chunks + lifecycle markers.
 * Responsibilities: chunk normalization, heartbeat, completion, cancellation.
 * Usage: Injected where streaming transports are used.
 * Future Extension: Backpressure, resumable streams. No SSE implementation.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { TransportSession } from "../contracts/session-connection";
import type { StreamingTransportChunk } from "../contracts/transport-io";
import type { ITransportStreamingEngine } from "../interfaces/engines";

export class DefaultTransportStreamingEngine
  implements ITransportStreamingEngine
{
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  normalizeChunk(
    raw: ProviderWirePayload,
    session: TransportSession,
    sequence: number
  ): Result<StreamingTransportChunk> {
    const source = raw as Record<string, unknown>;
    const done = Boolean(source.done ?? source.finished ?? false);
    const data =
      (source.delta as Record<string, unknown> | undefined) ??
      (source.data as Record<string, unknown> | undefined) ??
      (source.content !== undefined ? { content: source.content } : {});
    return success({
      sessionId: session.sessionId,
      requestId: session.requestId,
      sequence,
      kind: done ? "end" : "chunk",
      data,
      done,
      receivedAt: this.nowIso(),
    });
  }

  heartbeat(
    session: TransportSession,
    sequence: number
  ): Result<StreamingTransportChunk> {
    return success(this.marker(session, sequence, "heartbeat", false));
  }

  complete(
    session: TransportSession,
    sequence: number
  ): Result<StreamingTransportChunk> {
    return success(this.marker(session, sequence, "end", true));
  }

  cancel(
    session: TransportSession,
    sequence: number
  ): Result<StreamingTransportChunk> {
    return success(this.marker(session, sequence, "end", true));
  }

  private marker(
    session: TransportSession,
    sequence: number,
    kind: StreamingTransportChunk["kind"],
    done: boolean
  ): StreamingTransportChunk {
    return {
      sessionId: session.sessionId,
      requestId: session.requestId,
      sequence,
      kind,
      data: {},
      done,
      receivedAt: this.nowIso(),
    };
  }
}
