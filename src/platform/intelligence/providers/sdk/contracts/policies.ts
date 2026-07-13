/**
 * SDK retry and timeout policy contracts.
 *
 * Purpose: SDK-level retry/timeout configuration (independent of runtime/transport).
 * Responsibilities: Immutable policy descriptors.
 * Usage: SdkRequest, engine, retry/timeout engines.
 * Future Extension: Per-operation policies.
 */

import type { SdkRetryStrategy } from "./enums";

export interface SdkRetryPolicy {
  readonly strategy: SdkRetryStrategy;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs?: number;
}

export interface SdkTimeoutPolicy {
  readonly requestTimeoutMs: number;
  readonly connectTimeoutMs?: number;
  readonly streamIdleTimeoutMs?: number;
}
