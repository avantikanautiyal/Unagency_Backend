/**
 * Circuit breaker and registry.
 *
 * Purpose: Guard providers against repeated failures.
 * Responsibilities: Track closed/open/half-open state; permit/deny dispatch.
 * Usage: The runtime consults a per-provider breaker before dispatch.
 * Future Extension: Provider health-store integration.
 */

import type { ProviderId } from "../../../core/identifiers";
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
  type CircuitState,
} from "../contracts/circuit-breaker";
import type {
  ICircuitBreaker,
  ICircuitBreakerRegistry,
} from "../interfaces/circuit-breaker";
import {
  logCircuitTransition,
  type CircuitOutcomeContext,
} from "../diagnostics/circuit-transition-log";

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

  private _state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastTransitionAt: string;
  private openedAtMs?: number;
  private openedAtIso?: string;
  private lastFailureAt?: string;
  private lastFailureCategory?: string;

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

  canDispatch(ctx?: CircuitOutcomeContext): boolean {
    const before = this._state;
    if (this._state === "open") {
      if (
        this.openedAtMs !== undefined &&
        this.nowMs() - this.openedAtMs >= this.config.resetTimeoutMs
      ) {
        this.transition("half_open");
        this.emitLog("circuit_transition", before, this._state, {
          ...ctx,
          reason: ctx?.reason ?? "cooldown_elapsed_probe",
          circuitCounted: false,
        });
        return true;
      }
      this.emitLog("circuit_evaluation", before, this._state, {
        ...ctx,
        reason: ctx?.reason ?? "dispatch_denied_open",
        circuitCounted: false,
      });
      return false;
    }
    return true;
  }

  recordSuccess(ctx?: CircuitOutcomeContext): void {
    const before = this._state;
    if (this._state === "half_open") {
      this.successCount += 1;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
        this.emitLog("circuit_transition", before, this._state, {
          ...ctx,
          reason: ctx?.reason ?? "probe_success_close",
          circuitCounted: true,
        });
        return;
      }
      this.emitLog("circuit_evaluation", before, this._state, {
        ...ctx,
        reason: ctx?.reason ?? "probe_success_progress",
        circuitCounted: true,
      });
      return;
    }
    this.failureCount = 0;
    this.emitLog("circuit_evaluation", before, this._state, {
      ...ctx,
      reason: ctx?.reason ?? "success_reset_failures",
      circuitCounted: true,
    });
  }

  recordFailure(ctx?: CircuitOutcomeContext): void {
    const before = this._state;
    this.lastFailureAt = this.nowIso();
    if (ctx?.failureCategory) {
      this.lastFailureCategory = String(ctx.failureCategory);
    }

    if (this._state === "half_open") {
      this.open();
      this.emitLog("circuit_transition", before, this._state, {
        ...ctx,
        reason: ctx?.reason ?? "probe_failure_reopen",
        circuitCounted: ctx?.circuitCounted ?? true,
      });
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.config.failureThreshold) {
      this.open();
      this.emitLog("circuit_transition", before, this._state, {
        ...ctx,
        reason: ctx?.reason ?? "threshold_reached_open",
        circuitCounted: ctx?.circuitCounted ?? true,
      });
      return;
    }
    this.emitLog("circuit_evaluation", before, this._state, {
      ...ctx,
      reason: ctx?.reason ?? "failure_count_increment",
      circuitCounted: ctx?.circuitCounted ?? true,
    });
  }

  /**
   * Observe a failure that must NOT trip the breaker (e.g. HTTP 429),
   * while still emitting a structured diagnostic log.
   */
  observeNonTrippingFailure(ctx?: CircuitOutcomeContext): void {
    const before = this._state;
    this.lastFailureAt = this.nowIso();
    if (ctx?.failureCategory) {
      this.lastFailureCategory = String(ctx.failureCategory);
    }
    this.emitLog("circuit_evaluation", before, this._state, {
      ...ctx,
      reason: ctx?.reason ?? "non_tripping_failure",
      circuitCounted: false,
    });
  }

  reset(): void {
    this.transition("closed");
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAtMs = undefined;
    this.openedAtIso = undefined;
  }

  snapshot(): CircuitBreakerState {
    return {
      providerId: this.providerId,
      state: this._state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastTransitionAt: this.lastTransitionAt,
      openedAt: this.openedAtIso,
      openedAtMs: this.openedAtMs,
      failureThreshold: this.config.failureThreshold,
      successThreshold: this.config.successThreshold,
      resetTimeoutMs: this.config.resetTimeoutMs,
      lastFailureAt: this.lastFailureAt,
      lastFailureCategory: this.lastFailureCategory,
    };
  }

  private open(): void {
    this.transition("open");
    this.openedAtMs = this.nowMs();
    this.openedAtIso = this.lastTransitionAt;
    this.successCount = 0;
  }

  private transition(state: CircuitState): void {
    this._state = state;
    this.lastTransitionAt = this.nowIso();
  }

  private emitLog(
    event: "circuit_transition" | "circuit_evaluation",
    before: CircuitState,
    after: CircuitState,
    ctx?: CircuitOutcomeContext
  ): void {
    const cooldownUntil =
      after === "open" && this.openedAtMs !== undefined
        ? new Date(this.openedAtMs + this.config.resetTimeoutMs).toISOString()
        : undefined;
    logCircuitTransition({
      event,
      scope: "provider.circuit",
      provider: String(this.providerId),
      model: ctx?.model,
      capability: ctx?.capability,
      failureCategory: ctx?.failureCategory,
      httpStatus: ctx?.httpStatus,
      providerErrorCode: ctx?.providerErrorCode,
      circuitStateBefore: before,
      circuitStateAfter: after,
      failureCount: this.failureCount,
      failureThreshold: this.config.failureThreshold,
      cooldownMs: this.config.resetTimeoutMs,
      cooldownUntil,
      executionId: ctx?.executionId,
      correlationId: ctx?.correlationId,
      requestId: ctx?.requestId,
      timestamp: this.nowIso(),
      reason: ctx?.reason,
      circuitCounted: ctx?.circuitCounted,
    });
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
