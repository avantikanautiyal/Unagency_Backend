/**
 * Quota / rate-limit advisory models (observe-only).
 */

import type { ProviderOperationalRecord } from "../contracts/state";

export interface QuotaSignal {
  readonly providerId: string;
  readonly nearLimit: boolean;
  readonly utilization: number;
}

export interface RateLimitSignal {
  readonly providerId: string;
  readonly rateLimited: boolean;
}

export function deriveQuotaSignals(
  records: readonly ProviderOperationalRecord[]
): readonly QuotaSignal[] {
  return records.map((r) => ({
    providerId: r.providerId,
    nearLimit: r.telemetry.capacityUtilization >= 0.8,
    utilization: r.telemetry.capacityUtilization,
  }));
}

export function deriveRateLimitSignals(
  records: readonly ProviderOperationalRecord[]
): readonly RateLimitSignal[] {
  return records.map((r) => ({
    providerId: r.providerId,
    rateLimited: r.state === "rate_limited",
  }));
}
