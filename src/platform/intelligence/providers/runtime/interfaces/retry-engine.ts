/**
 * Retry engine port.
 *
 * Purpose: Compute retry decisions and backoff delays.
 * Responsibilities: Pure functions over a RetryPolicy and attempt number.
 * Usage: Consulted by the execution pipeline between attempts.
 * Future Extension: Per-error-class retry rules and jitter.
 */

import type { JitterMode, RetryPolicy } from "../contracts/retry-policy";

export interface IJitterStrategy {
  /** Apply jitter to a base delay. Reserved for future implementation. */
  apply(delayMs: number, mode: JitterMode): number;
}

export interface IRetryEngine {
  /**
   * Whether another attempt is allowed. `attempt` is the number of attempts
   * already made (1-based: 1 means the first attempt just finished).
   */
  shouldRetry(policy: RetryPolicy, attempt: number): boolean;

  /**
   * Delay before the next attempt, given attempts already made.
   */
  nextDelayMs(policy: RetryPolicy, attempt: number): number;
}
