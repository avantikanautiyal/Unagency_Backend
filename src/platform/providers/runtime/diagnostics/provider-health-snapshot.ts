/**
 * Safe provider-health snapshot for internal admin / debugging tooling.
 * No credentials or secrets.
 */

import type { CircuitState } from "../contracts/circuit-breaker";
import type { ICircuitBreakerRegistry } from "../interfaces/circuit-breaker";
import type { PerformanceFailureCategory } from "../../routing/performance/contracts/performance-evidence";

export interface ProviderHealthSnapshot {
  readonly provider: string;
  readonly circuitState: CircuitState;
  readonly failureCount: number;
  readonly failureThreshold: number;
  readonly cooldownRemainingMs: number;
  readonly lastFailureAt?: string;
  readonly lastFailureCategory?: PerformanceFailureCategory | string;
  readonly successCount: number;
  readonly lastTransitionAt: string;
  readonly openedAt?: string;
  readonly resetTimeoutMs: number;
}

export function buildProviderHealthSnapshots(
  registry: ICircuitBreakerRegistry,
  nowMs: () => number = () => Date.now()
): readonly ProviderHealthSnapshot[] {
  return registry.snapshots().map((snap) => {
    const openedAtMs =
      typeof snap.openedAtMs === "number"
        ? snap.openedAtMs
        : snap.openedAt
          ? Date.parse(snap.openedAt)
          : undefined;
    let cooldownRemainingMs = 0;
    if (snap.state === "open" && openedAtMs !== undefined && Number.isFinite(openedAtMs)) {
      const elapsed = nowMs() - openedAtMs;
      cooldownRemainingMs = Math.max(0, (snap.resetTimeoutMs ?? 30_000) - elapsed);
    }
    return {
      provider: String(snap.providerId),
      circuitState: snap.state,
      failureCount: snap.failureCount,
      failureThreshold: snap.failureThreshold ?? 5,
      cooldownRemainingMs,
      lastFailureAt: snap.lastFailureAt,
      lastFailureCategory: snap.lastFailureCategory,
      successCount: snap.successCount,
      lastTransitionAt: snap.lastTransitionAt,
      openedAt: snap.openedAt,
      resetTimeoutMs: snap.resetTimeoutMs ?? 30_000,
    };
  });
}
