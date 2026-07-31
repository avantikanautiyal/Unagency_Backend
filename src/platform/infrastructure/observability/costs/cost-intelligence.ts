/**
 * Cost intelligence aggregations.
 */

import type { CostRecord } from "../contracts/telemetry";
import type { CostIntelligenceSnapshot } from "../interfaces/observability";

function bump(map: Record<string, number>, key: string, amount: number): void {
  map[key] = (map[key] ?? 0) + amount;
}

export function aggregateCosts(
  records: readonly CostRecord[],
  filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  },
  budgetLimit?: number
): CostIntelligenceSnapshot {
  let list = [...records];
  if (filter?.organizationId) {
    list = list.filter((r) => r.context.organizationId === filter.organizationId);
  }
  if (filter?.providerId) {
    list = list.filter((r) => (r.providerId ?? r.context.providerId) === filter.providerId);
  }
  if (filter?.since) {
    const since = Date.parse(filter.since);
    list = list.filter((r) => Date.parse(r.at) >= since);
  }

  const byOrganization: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  const byCapability: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let total = 0;

  for (const r of list) {
    if (r.amount == null || !Number.isFinite(r.amount)) continue;
    total += r.amount;
    bump(byOrganization, r.context.organizationId ?? "unknown", r.amount);
    bump(byDepartment, r.department ?? r.context.department ?? "general", r.amount);
    bump(byCapability, r.capabilityId ?? r.context.capabilityId ?? "unknown", r.amount);
    bump(byProvider, r.providerId ?? r.context.providerId ?? "unknown", r.amount);
    bump(byModel, r.modelId ?? r.context.modelId ?? "unknown", r.amount);
  }

  const days = Math.max(1, uniqueDays(list));
  const projectedMonthly = (total / days) * 30;

  return {
    total,
    currency: list[0]?.currency ?? "USD",
    byOrganization,
    byDepartment,
    byCapability,
    byProvider,
    byModel,
    projectedMonthly,
    budgetUsagePercent:
      budgetLimit && budgetLimit > 0 ? Math.min(100, (total / budgetLimit) * 100) : undefined,
    records: list.length,
  };
}

function uniqueDays(records: readonly CostRecord[]): number {
  const days = new Set(records.map((r) => r.at.slice(0, 10)));
  return Math.max(1, days.size);
}
