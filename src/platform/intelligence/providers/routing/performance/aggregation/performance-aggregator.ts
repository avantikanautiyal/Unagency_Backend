/**
 * Aggregate performance evidence into metrics with recency weighting.
 */

import type { PerformanceEvidence } from "../contracts/performance-evidence";
import type { ModelPerformanceMetrics } from "../contracts/performance-metrics";

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function mean(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export interface AggregateOptions {
  readonly windowDays: number;
  /** Fraction of window considered "recent" for recentSampleCount (default 0.25). */
  readonly recentFraction?: number;
  readonly nowMs?: () => number;
}

export function aggregatePerformanceEvidence(
  evidence: readonly PerformanceEvidence[],
  key: {
    providerId: string;
    modelId: string;
    capabilityId?: string;
    organizationId?: string;
  },
  options: AggregateOptions
): ModelPerformanceMetrics | undefined {
  // Exclude infrastructure failures from provider penalty aggregates.
  const usable = evidence.filter(
    (e) =>
      e.providerId === key.providerId &&
      e.modelId === key.modelId &&
      (!key.capabilityId || e.capabilityId === key.capabilityId) &&
      (!key.organizationId || e.organizationId === key.organizationId) &&
      !e.infrastructureFailure
  );

  if (usable.length === 0) return undefined;

  const nowMs = options.nowMs?.() ?? Date.now();
  const windowMs = options.windowDays * 86_400_000;
  const windowStartMs = nowMs - windowMs;
  const recentStartMs = nowMs - windowMs * (options.recentFraction ?? 0.25);

  const inWindow = usable.filter((e) => Date.parse(e.completedAt) >= windowStartMs);
  const rows = inWindow.length > 0 ? inWindow : usable;

  const successes = rows.filter((e) => e.success);
  const failures = rows.filter((e) => !e.success);
  const timeouts = rows.filter((e) => e.timeoutOccurred || e.failureCategory === "timeout");
  const rateLimits = rows.filter(
    (e) => e.rateLimited || e.failureCategory === "rate_limit"
  );

  const latencies = [...rows.map((e) => e.latencyMs)].sort((a, b) => a - b);
  const evalScores = rows
    .filter((e) => e.feedbackEligible === true)
    .map((e) => e.evaluationScore)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  const tokens = rows
    .map((e) => e.totalTokens)
    .filter((v): v is number => typeof v === "number");

  // M9.5Q: only costEligible amounts in a single currency feed averageCost.
  const eligibleCostRows = rows.filter(
    (e) =>
      e.costEligible === true &&
      typeof e.estimatedCost === "number" &&
      Number.isFinite(e.estimatedCost) &&
      typeof e.costCurrency === "string" &&
      e.costCurrency.length > 0
  );
  const currencies = new Set(eligibleCostRows.map((e) => e.costCurrency as string));
  const costComparable = currencies.size === 1;
  const costs = costComparable
    ? eligibleCostRows.map((e) => e.estimatedCost as number)
    : [];
  const unknownCostSampleCount = rows.filter(
    (e) =>
      e.costEligible !== true ||
      e.estimatedCost == null ||
      !Number.isFinite(e.estimatedCost as number)
  ).length;

  const recent = rows.filter((e) => Date.parse(e.completedAt) >= recentStartMs);

  let lastSuccessAt: string | undefined;
  let lastFailureAt: string | undefined;
  for (const e of [...rows].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))) {
    if (e.success && !lastSuccessAt) lastSuccessAt = e.completedAt;
    if (!e.success && !lastFailureAt) lastFailureAt = e.completedAt;
  }

  return {
    providerId: key.providerId,
    modelId: key.modelId,
    capabilityId: key.capabilityId,
    organizationId: key.organizationId,
    successRate: successes.length / rows.length,
    evaluationMean: mean(evalScores),
    evaluationP50: percentile(evalScores, 50),
    evaluationP95: percentile(evalScores, 95),
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    failureRate: failures.length / rows.length,
    timeoutRate: timeouts.length / rows.length,
    rateLimitRate: rateLimits.length / rows.length,
    averageTokens: mean(tokens),
    averageCost: costs.length > 0 ? mean(costs)! : null,
    costCurrency: costComparable ? ([...currencies][0] ?? null) : null,
    costSampleCount: costs.length,
    unknownCostSampleCount,
    sampleCount: rows.length,
    recentSampleCount: recent.length,
    lastSuccessAt,
    lastFailureAt,
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(nowMs).toISOString(),
  };
}

/**
 * Recency-weighted success rate: recent window contributes more than older samples.
 */
export function recencyWeightedSuccessRate(
  evidence: readonly PerformanceEvidence[],
  options: { windowDays: number; nowMs?: () => number }
): number | undefined {
  const nowMs = options.nowMs?.() ?? Date.now();
  const windowMs = options.windowDays * 86_400_000;
  const usable = evidence.filter((e) => !e.infrastructureFailure);
  if (usable.length === 0) return undefined;

  let weightSum = 0;
  let successWeight = 0;
  for (const e of usable) {
    const age = Math.max(0, nowMs - Date.parse(e.completedAt));
    const freshness = Math.max(0, 1 - age / windowMs);
    const w = 0.25 + 0.75 * freshness; // floor so old evidence still counts lightly
    weightSum += w;
    if (e.success) successWeight += w;
  }
  return weightSum > 0 ? successWeight / weightSum : undefined;
}
