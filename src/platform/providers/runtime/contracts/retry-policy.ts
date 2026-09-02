/**
 * Retry policy contract.
 *
 * Purpose: Provider-independent retry configuration.
 * Responsibilities: Describe retry strategy, attempts, and backoff.
 * Usage: Attached to ProviderExecutionRequest; consumed by IRetryEngine.
 * Future Extension: Jitter strategies and per-error-class retry rules.
 */

export type RetryStrategy =
  | "none"
  | "immediate"
  | "fixed"
  | "linear"
  | "exponential";

/**
 * Jitter is reserved for a future milestone. The interface is declared now so
 * retry policies remain forward-compatible without breaking public contracts.
 */
export type JitterMode = "none" | "full" | "equal";

export interface RetryPolicy {
  readonly strategy: RetryStrategy;
  /** Total attempts including the first attempt. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs?: number;
  /** Multiplier for exponential backoff (defaults to 2). */
  readonly multiplier?: number;
  /** Reserved for future jitter implementation. */
  readonly jitter?: JitterMode;
}

export const NO_RETRY_POLICY: RetryPolicy = {
  strategy: "none",
  maxAttempts: 1,
  baseDelayMs: 0,
};
