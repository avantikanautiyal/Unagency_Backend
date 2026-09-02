/**
 * Ledger-backed AI cost queries for admin billing analytics.
 */

import { AICostAnalyticsService } from "../../accounting/analytics/ai-cost-analytics-service";
import type { AdminPeriodFilter } from "../../accounting/contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../../accounting/money/usd-money";

const analytics = new AICostAnalyticsService();

function mapLegacyPeriod(period?: string): AdminPeriodFilter {
  const normalized = (period ?? "mtd").toLowerCase();
  if (normalized === "yearly" || normalized === "year") return "current_year";
  if (normalized === "quarterly" || normalized === "quarter") return "last_3_months";
  return "current_month";
}

export async function sumLedgerAiCostUsd(input: {
  readonly period?: string;
  readonly organizationId?: string;
  readonly start?: Date;
  readonly end?: Date;
}): Promise<{
  aiCostUsd: number;
  requestCount: number;
  byProvider: Map<string, { amount: number; count: number }>;
  overview: Awaited<ReturnType<AICostAnalyticsService["buildAnalytics"]>>["overview"];
}> {
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: input.organizationId,
    customRange:
      input.start && input.end ? { start: input.start, end: input.end } : undefined,
  });

  const aiCostUsd = Number(bundle.overview.liveInternalSpendUsd ?? 0);
  const byProvider = new Map<string, { amount: number; count: number }>();
  for (const row of bundle.byProvider) {
    byProvider.set(row.providerId, {
      amount: Number(row.spendUsd ?? 0),
      count: row.requestCount,
    });
  }

  return {
    aiCostUsd: Number.isFinite(aiCostUsd) ? aiCostUsd : 0,
    requestCount: bundle.overview.requestCount,
    byProvider,
    overview: bundle.overview,
  };
}

export async function sumLedgerAiCostByOrganization(input: {
  readonly start: Date;
  readonly end: Date;
  readonly organizationIds: readonly string[];
}): Promise<Map<string, { aiCostUsd: number; executions: number }>> {
  const result = new Map<string, { aiCostUsd: number; executions: number }>();
  for (const organizationId of input.organizationIds) {
    const row = await sumLedgerAiCostUsd({
      start: input.start,
      end: input.end,
      organizationId,
    });
    result.set(organizationId, {
      aiCostUsd: row.aiCostUsd,
      executions: row.requestCount,
    });
  }
  return result;
}

export function usdToDisplayAmount(usd: number, currency: string, fxRate?: number | null): number {
  if (currency.toUpperCase() === "USD") return usd;
  if (fxRate && Number.isFinite(fxRate) && fxRate > 0) return usd * fxRate;
  return usd;
}

export function addUsdAmounts(values: readonly string[]): number {
  let total = BigInt(0);
  for (const value of values) {
    const micro = parseUsdToMicro(value);
    if (micro) total += micro;
  }
  return Number(microToUsdString(total));
}
