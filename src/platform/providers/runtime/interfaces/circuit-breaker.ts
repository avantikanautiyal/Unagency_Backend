/**
 * Circuit breaker ports.
 *
 * Purpose: Guard providers against repeated failures.
 * Responsibilities: Track state; permit/deny dispatch; record outcomes.
 * Usage: The runtime consults a per-provider breaker before dispatch.
 * Future Extension: Provider health-store integration.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { CircuitBreakerState } from "../contracts/circuit-breaker";

export interface ICircuitBreaker {
  readonly providerId: ProviderId;
  readonly state: CircuitBreakerState;
  canDispatch(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  /** Force closed so a healthy alternate path / cooldown can resume. */
  reset(): void;
  snapshot(): CircuitBreakerState;
}

export interface ICircuitBreakerRegistry {
  forProvider(providerId: ProviderId): ICircuitBreaker;
  snapshots(): readonly CircuitBreakerState[];
}
