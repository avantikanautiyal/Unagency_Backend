/**
 * Ledger-backed AI cost queries for admin billing analytics.
 */

import { AICostAnalyticsService } from "../../accounting/analytics/ai-cost-analytics-service";
import type { AdminPeriodFilter } from "../../accounting/contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../../accounting/money/usd-money";
import { liveAmountUsd, isInPeriod } from "../../accounting/eligibility/accounting-eligibility";
import { MongoUsageLedger } from "../../accounting/ledger/usage-ledger";

const analytics = new AICostAnalyticsService();
const ledger = new MongoUsageLedger();

function mapLegacyPeriod(period?: string): AdminPeriodFilter {
  const normalized = (period ?? "mtd").toLowerCase();
  if (normalized === "yearly" || normalized === "year") return "current_year";
  if (normalized === "quarterly" || normalized === "quarter") return "last_3_months";
  return "current_month";
}

/** Billing-tz month key YYYY-MM (IST offset, matches admin-billing-analytics-service). */
function monthKeyBillingTz(date: Date): string {
  const BILLING_TZ_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + BILLING_TZ_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
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

/**
 * One ledger scan for the whole range, then in-memory rollup by organization.
 * Replaces the previous N× buildAnalytics fan-out (major admin dashboard bottleneck).
 */
export async function sumLedgerAiCostByOrganization(input: {
  readonly start: Date;
  readonly end: Date;
  readonly organizationIds: readonly string[];
}): Promise<Map<string, { aiCostUsd: number; executions: number }>> {
  const result = new Map<string, { aiCostUsd: number; executions: number }>();
  for (const organizationId of input.organizationIds) {
    result.set(organizationId, { aiCostUsd: 0, executions: 0 });
  }
  if (!input.organizationIds.length) return result;

  const wanted = new Set(input.organizationIds);
  const records = await ledger.listRecords({
    start: input.start,
    end: input.end,
  });

  const microByOrg = new Map<string, bigint>();
  const countByOrg = new Map<string, number>();

  for (const record of records) {
    const organizationId = record.organizationId;
    if (!wanted.has(organizationId)) continue;
    if (!isInPeriod(record, { start: input.start, end: input.end })) continue;

    countByOrg.set(organizationId, (countByOrg.get(organizationId) ?? 0) + 1);
    const live = liveAmountUsd(record);
    if (!live) continue;
    const micro = parseUsdToMicro(live);
    if (micro == null) continue;
    microByOrg.set(organizationId, (microByOrg.get(organizationId) ?? BigInt(0)) + micro);
  }

  for (const organizationId of input.organizationIds) {
    const micro = microByOrg.get(organizationId) ?? BigInt(0);
    result.set(organizationId, {
      aiCostUsd: micro > BigInt(0) ? Number(microToUsdString(micro)) : 0,
      executions: countByOrg.get(organizationId) ?? 0,
    });
  }

  return result;
}

/**
 * One ledger scan for a multi-month window, bucketed by billing-tz month key.
 * Replaces six sequential sumLedgerAiCostUsd calls in the monthly trend.
 */
export async function sumLedgerAiCostByMonth(input: {
  readonly start: Date;
  readonly end: Date;
  readonly organizationId?: string;
}): Promise<Map<string, number>> {
  const byMonth = new Map<string, number>();
  const records = await ledger.listRecords({
    start: input.start,
    end: input.end,
    organizationId: input.organizationId,
  });

  const microByMonth = new Map<string, bigint>();
  for (const record of records) {
    if (
      !isInPeriod(record, {
        start: input.start,
        end: input.end,
        organizationId: input.organizationId,
      })
    ) {
      continue;
    }
    const completedAt = Date.parse(record.completedAt);
    if (!Number.isFinite(completedAt)) continue;
    const key = monthKeyBillingTz(new Date(completedAt));
    const live = liveAmountUsd(record);
    if (!live) continue;
    const micro = parseUsdToMicro(live);
    if (micro == null) continue;
    microByMonth.set(key, (microByMonth.get(key) ?? BigInt(0)) + micro);
  }

  for (const [key, micro] of microByMonth.entries()) {
    byMonth.set(key, micro > BigInt(0) ? Number(microToUsdString(micro)) : 0);
  }
  return byMonth;
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
