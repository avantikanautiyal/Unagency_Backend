/**
 * Circuit breaker and registry.
 *
 * Purpose: Guard providers against repeated failures.
 * Responsibilities: Track closed/open/half-open state; permit/deny dispatch.
 * Usage: The runtime consults a per-provider breaker before dispatch.
 * Future Extension: Provider health-store integration.
 */

import type { ProviderId } from "../../../shared/identifiers";
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
} from "../contracts/circuit-breaker";
import type {
  ICircuitBreaker,
  ICircuitBreakerRegistry,
} from "../interfaces/circuit-breaker";

export interface CircuitBreakerDependencies {
  readonly providerId: ProviderId;
  readonly config?: CircuitBreakerConfig;
  readonly nowIso?: () => string;
  readonly nowMs?: () => number;
}

export class CircuitBreaker implements ICircuitBreaker {
  readonly providerId: ProviderId;
  private readonly config: CircuitBreakerConfig;
  private readonly nowIso: () => string;
  private readonly nowMs: () => number;

  private _state: CircuitBreakerState["state"] = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastTransitionAt: string;
  private openedAtMs?: number;
  private openedAtIso?: string;

  constructor(deps: CircuitBreakerDependencies) {
    this.providerId = deps.providerId;
    this.config = deps.config ?? DEFAULT_CIRCUIT_BREAKER_CONFIG;
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.nowMs = deps.nowMs ?? (() => Date.now());
    this.lastTransitionAt = this.nowIso();
  }

  get state(): CircuitBreakerState {
    return this.snapshot();
  }

  canDispatch(): boolean {
    if (this._state === "open") {
      if (
        this.openedAtMs !== undefined &&
        this.nowMs() - this.openedAtMs >= this.config.resetTimeoutMs
      ) {
        this.transition("half_open");
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    if (this._state === "half_open") {
      this.successCount += 1;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
      return;
    }
    this.failureCount = 0;
  }

  recordFailure(): void {
    if (this._state === "half_open") {
      this.open();
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.config.failureThreshold) {
      this.open();
    }
  }

  snapshot(): CircuitBreakerState {
    return {
      providerId: this.providerId,
      state: this._state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastTransitionAt: this.lastTransitionAt,
      openedAt: this.openedAtIso,
    };
  }

  private open(): void {
    this.transition("open");
    this.openedAtMs = this.nowMs();
    this.openedAtIso = this.lastTransitionAt;
    this.successCount = 0;
  }

  private reset(): void {
    this.transition("closed");
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAtMs = undefined;
    this.openedAtIso = undefined;
  }

  private transition(state: CircuitBreakerState["state"]): void {
    this._state = state;
    this.lastTransitionAt = this.nowIso();
  }
}

export class CircuitBreakerRegistry implements ICircuitBreakerRegistry {
  private readonly breakers = new Map<string, ICircuitBreaker>();

  constructor(
    private readonly config?: CircuitBreakerConfig,
    private readonly nowIso?: () => string,
    private readonly nowMs?: () => number
  ) {}

  forProvider(providerId: ProviderId): ICircuitBreaker {
    const key = String(providerId);
    const existing = this.breakers.get(key);
    if (existing) {
      return existing;
    }
    const breaker = new CircuitBreaker({
      providerId,
      config: this.config,
      nowIso: this.nowIso,
      nowMs: this.nowMs,
    });
    this.breakers.set(key, breaker);
    return breaker;
  }

  snapshots(): readonly CircuitBreakerState[] {
    return Array.from(this.breakers.values()).map((b) => b.snapshot());
  }
}
