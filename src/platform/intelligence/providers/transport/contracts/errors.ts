/**
 * Transport error + statistics contracts.
 *
 * Purpose: Canonical transport error + measurable statistics.
 * Responsibilities: Provider-independent error classification + metrics.
 * Usage: Produced by clients, pipeline, diagnostics.
 * Future Extension: Per-hop timing breakdowns.
 */

import type {
  CompressionAlgorithm,
  TransportErrorKind,
  TransportProtocol,
} from "./enums";

export interface TransportError {
  readonly kind: TransportErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly protocol?: TransportProtocol;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TransportStatistics {
  readonly protocol: TransportProtocol;
  readonly attempts: number;
  readonly retries: number;
  readonly latencyMs?: number;
  readonly serializedBytes?: number;
  readonly deserializedBytes?: number;
  readonly compression?: CompressionAlgorithm;
  readonly reusedConnection?: boolean;
}
