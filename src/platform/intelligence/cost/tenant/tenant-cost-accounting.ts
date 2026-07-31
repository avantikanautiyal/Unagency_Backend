/**
 * M9.5Q — Tenant cost accounting over PerformanceEvidence (not customer billing).
 */

import type { IModelPerformanceStore } from "../../providers/routing/performance/interfaces/model-performance-store";

export interface TenantSpendQuery {
  readonly organizationId: string;
  readonly sinceIso?: string;
  readonly untilIso?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityId?: string;
  readonly limit?: number;
}

export interface TenantSpendSummary {
  readonly organizationId: string;
  readonly currency: string | null;
  readonly knownSpend: number;
  readonly knownSampleCount: number;
  readonly unknownSampleCount: number;
  readonly byProvider: Readonly<Record<string, number>>;
  readonly byModel: Readonly<Record<string, number>>;
  readonly byCapability: Readonly<Record<string, number>>;
}

/**
 * Fail closed without organizationId.
 * Only sums samples with numeric estimatedCost (known amounts).
 * Cross-currency → currency null, knownSpend not mixed.
 */
export async function queryTenantSpend(
  store: IModelPerformanceStore,
  query: TenantSpendQuery
): Promise<TenantSpendSummary> {
  if (!query.organizationId) {
    throw new Error("tenant_spend_requires_organizationId");
  }

  const rows = await store.query({
    organizationId: query.organizationId,
    providerId: query.providerId,
    modelId: query.modelId,
    capabilityId: query.capabilityId,
    sinceIso: query.sinceIso,
    untilIso: query.untilIso,
    limit: query.limit ?? 5000,
  });

  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byCapability: Record<string, number> = {};
  let knownSpend = 0;
  let knownSampleCount = 0;
  let unknownSampleCount = 0;
  const currencies = new Set<string>();

  for (const e of rows) {
    if (
      typeof e.estimatedCost === "number" &&
      Number.isFinite(e.estimatedCost) &&
      e.costCurrency
    ) {
      currencies.add(e.costCurrency);
      knownSpend += e.estimatedCost;
      knownSampleCount += 1;
      byProvider[e.providerId] = (byProvider[e.providerId] ?? 0) + e.estimatedCost;
      byModel[e.modelId] = (byModel[e.modelId] ?? 0) + e.estimatedCost;
      byCapability[e.capabilityId] =
        (byCapability[e.capabilityId] ?? 0) + e.estimatedCost;
    } else {
      unknownSampleCount += 1;
    }
  }

  return {
    organizationId: query.organizationId,
    currency: currencies.size === 1 ? [...currencies][0]! : null,
    knownSpend: currencies.size === 1 ? knownSpend : currencies.size === 0 ? 0 : 0,
    knownSampleCount,
    unknownSampleCount,
    byProvider: currencies.size <= 1 ? byProvider : {},
    byModel: currencies.size <= 1 ? byModel : {},
    byCapability: currencies.size <= 1 ? byCapability : {},
  };
}

/** Budget policy seam — observe only for M9.5Q (no billing redesign). */
export type CostBudgetMode = "disabled" | "observe" | "enforce_known_cost";

export interface CostBudgetDecision {
  readonly mode: CostBudgetMode;
  readonly allowed: boolean;
  readonly reason: string;
}

export function evaluateCostBudgetGuard(input: {
  readonly mode: CostBudgetMode;
  readonly knownSpend: number;
  readonly budgetLimit: number | null;
  readonly upcomingCostKnown: boolean;
}): CostBudgetDecision {
  if (input.mode === "disabled") {
    return { mode: input.mode, allowed: true, reason: "budget_disabled" };
  }
  if (input.mode === "observe") {
    return { mode: input.mode, allowed: true, reason: "observe_only" };
  }
  // enforce_known_cost
  if (!input.upcomingCostKnown) {
    return {
      mode: input.mode,
      allowed: true,
      reason: "unknown_cost_not_rejected_by_default",
    };
  }
  if (input.budgetLimit == null) {
    return { mode: input.mode, allowed: true, reason: "no_budget_limit" };
  }
  if (input.knownSpend >= input.budgetLimit) {
    return { mode: input.mode, allowed: false, reason: "budget_exceeded" };
  }
  return { mode: input.mode, allowed: true, reason: "within_budget" };
}
