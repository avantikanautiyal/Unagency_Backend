/**
 * M9.5Q — Cost integrity contracts.
 * Principle: UNKNOWN COST IS BETTER THAN FAKE COST.
 */

import type { NormalizedUsage } from "./normalized-usage";

export type CostStatus =
  | "calculated"
  | "partially_calculated"
  | "unknown"
  | "unavailable"
  | "not_applicable";

export type CostMethod =
  | "provider_reported"
  | "pricing_catalogue"
  | "contract_rate"
  | "none";

export type CostTrustLevel = "high" | "medium" | "low" | "none";

export type CostDimension =
  | "input_tokens"
  | "output_tokens"
  | "cached_input_tokens"
  | "characters"
  | "audio_seconds"
  | "transcription_seconds"
  | "image"
  | "video_seconds"
  | "compute_units"
  | "request";

export interface CostComponent {
  readonly dimension: CostDimension;
  readonly quantity: number;
  readonly unitSize: number;
  readonly unitPrice: number;
  readonly amount: number;
}

/**
 * Canonical cost record for attempt / execution accounting.
 * amount is null when unknown — NEVER invent 0.
 */
export interface CanonicalCostRecord {
  readonly status: CostStatus;
  readonly method: CostMethod;
  readonly trust: CostTrustLevel;
  /** Only true when amount may influence economic routing. */
  readonly routingEligible: boolean;
  readonly currency: string | null;
  readonly amount: number | null;
  readonly components: readonly CostComponent[];
  readonly pricingVersion?: string | null;
  readonly pricingEffectiveAt?: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly usageSnapshot?: NormalizedUsage | null;
  readonly calculatedAt: string;
  readonly exclusionReason?: string;
  readonly provenance?: string;
}

export interface ExecutionCostAggregate {
  readonly status: CostStatus;
  readonly currency: string | null;
  /** Sum of known attempt amounts in a single currency. */
  readonly knownAmount: number;
  /**
   * Complete total only when every billable attempt has known cost
   * in the same currency; otherwise null.
   */
  readonly totalAmount: number | null;
  readonly knownAttemptCount: number;
  readonly unknownAttemptCount: number;
  readonly routingEligible: boolean;
  readonly attempts: readonly CanonicalCostRecord[];
}

export function unknownCost(input: {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly reason: string;
  readonly nowIso?: string;
  readonly usageSnapshot?: NormalizedUsage | null;
}): CanonicalCostRecord {
  return {
    status: "unknown",
    method: "none",
    trust: "none",
    routingEligible: false,
    currency: null,
    amount: null,
    components: [],
    pricingVersion: null,
    providerId: input.providerId,
    modelId: input.modelId,
    capabilityId: input.capabilityId,
    usageSnapshot: input.usageSnapshot ?? null,
    calculatedAt: input.nowIso ?? new Date().toISOString(),
    exclusionReason: input.reason,
  };
}

export function aggregateAttemptCosts(
  attempts: readonly CanonicalCostRecord[]
): ExecutionCostAggregate {
  if (attempts.length === 0) {
    return {
      status: "unknown",
      currency: null,
      knownAmount: 0,
      totalAmount: null,
      knownAttemptCount: 0,
      unknownAttemptCount: 0,
      routingEligible: false,
      attempts: [],
    };
  }

  const known = attempts.filter(
    (a) => a.amount != null && Number.isFinite(a.amount) && a.currency != null
  );
  const unknownAttemptCount = attempts.length - known.length;

  const currencies = new Set(known.map((a) => a.currency as string));
  if (currencies.size > 1) {
    return {
      status: "partially_calculated",
      currency: null,
      knownAmount: 0,
      totalAmount: null,
      knownAttemptCount: known.length,
      unknownAttemptCount,
      routingEligible: false,
      attempts,
    };
  }

  const currency = known.length > 0 ? (known[0]!.currency as string) : null;
  const knownAmount = known.reduce((s, a) => s + (a.amount as number), 0);

  if (unknownAttemptCount > 0) {
    return {
      status: known.length > 0 ? "partially_calculated" : "unknown",
      currency,
      knownAmount,
      totalAmount: null,
      knownAttemptCount: known.length,
      unknownAttemptCount,
      routingEligible: false,
      attempts,
    };
  }

  const allEligible = attempts.every((a) => a.routingEligible);
  return {
    status: "calculated",
    currency,
    knownAmount,
    totalAmount: knownAmount,
    knownAttemptCount: known.length,
    unknownAttemptCount: 0,
    routingEligible: allEligible && currency != null,
    attempts,
  };
}

const TRUST_RANK: Record<CostTrustLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function costTrustMeetsMinimum(
  trust: CostTrustLevel,
  minimum: CostTrustLevel
): boolean {
  return TRUST_RANK[trust] >= TRUST_RANK[minimum];
}

export function isCostRoutingEligible(record: CanonicalCostRecord): boolean {
  return (
    record.routingEligible === true &&
    record.amount != null &&
    Number.isFinite(record.amount) &&
    record.currency != null &&
    record.trust !== "none" &&
    record.trust !== "low"
  );
}
