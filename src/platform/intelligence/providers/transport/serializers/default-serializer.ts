/**
 * Default transport serializer.
 *
 * Purpose: CanonicalProviderRequest → TransportRequest.
 * Responsibilities: Map canonical fields to a protocol request (opaque body).
 * Usage: Injected into the pipeline.
 * Future Extension: Protobuf/MessagePack serializers.
 *
 * Produces only vendor-independent shapes. No networking.
 */

import { success, type Result } from "../../../shared/result";
import type { CanonicalProviderRequest } from "../contracts/canonical";
import type { TransportSession } from "../contracts/session-connection";
import type { TransportRequest } from "../contracts/transport-io";
import type { ITransportSerializer } from "../interfaces/serde";

export class DefaultTransportSerializer implements ITransportSerializer {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  serialize(
    request: CanonicalProviderRequest,
    session: TransportSession
  ): Result<TransportRequest> {
    return success({
      sessionId: session.sessionId,
      requestId: request.requestId,
      protocol: request.protocol,
      operation: request.target.operation,
      body: request.payload,
      headers: request.headers,
      streaming: request.streaming,
      timeoutMs: request.timeoutMs,
      compression: request.compression,
      createdAt: this.nowIso(),
    });
  }
}

/** Approximate serialized byte length of a transport body. */
export function byteLength(body: string | Readonly<Record<string, unknown>>): number {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Buffer.byteLength(text, "utf8");
}
