/**
 * Circuit breaker contract.
 *
 * Purpose: Immutable snapshot of a provider circuit breaker.
 * Responsibilities: Describe breaker state and counters.
 * Usage: Exposed by ICircuitBreaker; consulted before dispatch.
 * Future Extension: Provider health-store integration (M4.x).
 */

import type { ProviderId } from "../../../core/identifiers";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerState {
  readonly providerId: ProviderId;
  readonly state: CircuitState;
  readonly failureCount: number;
  readonly successCount: number;
  readonly lastTransitionAt: string;
  readonly openedAt?: string;
}

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening. */
  readonly failureThreshold: number;
  /** Successes in half-open before closing. */
  readonly successThreshold: number;
  /** Time the circuit stays open before transitioning to half-open. */
  readonly resetTimeoutMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30_000,
};
