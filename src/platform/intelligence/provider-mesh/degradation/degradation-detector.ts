/**
 * Degradation detector.
 */

import type { ProviderOperationalRecord } from "../contracts/state";

export interface DegradationSignal {
  readonly providerId: string;
  readonly degraded: boolean;
  readonly trend: string;
}

export function detectDegradation(
  records: readonly ProviderOperationalRecord[]
): readonly DegradationSignal[] {
  return records.map((r) => ({
    providerId: r.providerId,
    degraded: r.state === "degraded" || r.telemetry.healthTrend === "worsening",
    trend: r.telemetry.healthTrend,
  }));
}
