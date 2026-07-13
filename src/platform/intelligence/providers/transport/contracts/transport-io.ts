/**
 * Protocol-level transport request/response + streaming chunk contracts.
 *
 * Purpose: The serialized (protocol-facing) shapes, still vendor-independent.
 * Responsibilities: Carry a serialized body + headers between serde and client.
 * Usage: Produced by ITransportSerializer; consumed by ITransportClient.
 * Future Extension: Binary frame descriptors.
 *
 * `body` is a serialized, opaque value (string or record) — NOT a vendor object.
 */

import type { CompressionAlgorithm, StreamEventKind, TransportProtocol } from "./enums";
import type { TransportSessionId } from "./identifiers";

export type TransportBody = string | Readonly<Record<string, unknown>>;

export interface TransportRequest {
  readonly sessionId: TransportSessionId;
  readonly requestId: string;
  readonly protocol: TransportProtocol;
  readonly operation: string;
  readonly body: TransportBody;
  readonly headers: Readonly<Record<string, string>>;
  readonly streaming: boolean;
  readonly timeoutMs: number;
  readonly compression: CompressionAlgorithm;
  readonly createdAt: string;
}

export interface TransportResponse {
  readonly sessionId: TransportSessionId;
  readonly requestId: string;
  readonly protocol: TransportProtocol;
  readonly body: TransportBody;
  readonly headers: Readonly<Record<string, string>>;
  readonly statusHint?: number;
  readonly streamed: boolean;
  readonly receivedAt: string;
}

export interface StreamingTransportChunk {
  readonly sessionId: TransportSessionId;
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: StreamEventKind;
  readonly data: Readonly<Record<string, unknown>>;
  readonly done: boolean;
  readonly receivedAt: string;
}
