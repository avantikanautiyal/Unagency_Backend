/**
 * SDK error + statistics contracts.
 *
 * Purpose: Canonical SDK error classification + measurable statistics.
 * Responsibilities: Provider-independent error + metrics.
 * Usage: Produced by clients, engine, diagnostics.
 * Future Extension: Per-hop timing breakdowns.
 */

import type { SdkErrorKind, SdkVendor } from "./enums";

export interface SdkError {
  readonly kind: SdkErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly vendor?: SdkVendor;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface SdkStatistics {
  readonly vendor: SdkVendor;
  readonly attempts: number;
  readonly retries: number;
  readonly latencyMs?: number;
  readonly streamed: boolean;
}
