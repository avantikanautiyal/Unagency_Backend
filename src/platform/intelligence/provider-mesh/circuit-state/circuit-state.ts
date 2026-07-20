/**
 * Circuit-state advisory (observe-only; does not trip breakers).
 */

import type { ProviderOperationalRecord } from "../contracts/state";

export type MeshCircuitState = "closed" | "open" | "half_open";

export interface CircuitStateSignal {
  readonly providerId: string;
  readonly state: MeshCircuitState;
  readonly reason: string;
}

export function deriveCircuitStates(
  records: readonly ProviderOperationalRecord[]
): readonly CircuitStateSignal[] {
  return records.map((r) => {
    if (r.state === "unavailable" || r.telemetry.errorRate >= 0.5) {
      return {
        providerId: r.providerId,
        state: "open" as const,
        reason: "high_error_or_unavailable",
      };
    }
    if (r.state === "degraded" || r.telemetry.healthTrend === "worsening") {
      return {
        providerId: r.providerId,
        state: "half_open" as const,
        reason: "degraded_or_worsening",
      };
    }
    return {
      providerId: r.providerId,
      state: "closed" as const,
      reason: "within_operational_bounds",
    };
  });
}
