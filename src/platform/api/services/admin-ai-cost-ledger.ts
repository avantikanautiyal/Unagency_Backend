/**
 * Ledger-backed AI cost queries for admin billing analytics.
 */

import { AICostAnalyticsService } from "../../accounting/analytics/ai-cost-analytics-service";
import type { AdminPeriodFilter } from "../../accounting/contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../../accounting/money/usd-money";
import { liveAmountUsd, isInPeriod } from "../../accounting/eligibility/accounting-eligibility";
import { MongoUsageLedger } from "../../accounting/ledger/usage-ledger";
import type { AIUsageRecord } from "../../accounting/contracts/ai-usage-record";
import { AI_USAGE_INVOCATION_STATUS } from "../../accounting/contracts/enums";
import { ProviderBillingLineModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-line.model";
import { ProviderBillingSyncStateModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-sync-state.model";
import { getProviderBillingSyncService } from "../../accounting/reconciliation/provider-billing-sync-service";
import { logAccountingError } from "../../accounting/observability/accounting-metrics";
import { invalidateAdminCache } from "./admin-metrics-cache";

const analytics = new AICostAnalyticsService();
const ledger = new MongoUsageLedger();

function mapLegacyPeriod(period?: string): AdminPeriodFilter {
  const normalized = (period ?? "mtd").toLowerCase();
  if (normalized === "yearly" || normalized === "year") return "current_year";
  if (normalized === "quarterly" || normalized === "quarter") return "last_3_months";
  return "current_month";
}

const BILLING_TZ_OFFSET_MS =
  Number(process.env.ADMIN_BILLING_TZ_OFFSET_MINUTES ?? 330) * 60_000;
const PROVIDER_SYNC_TTL_MS =
  Number(process.env.ADMIN_PROVIDER_BILLING_SYNC_TTL_MIN ?? 60) * 60_000;
/** How long a dashboard request waits for the very first provider sync before falling back. */
const PROVIDER_FIRST_SYNC_WAIT_MS = Number(
  process.env.ADMIN_PROVIDER_BILLING_FIRST_SYNC_WAIT_MS ?? 15_000
);
const PROVIDER_SYNC_MONTHS = 6;

/** Billing-tz month key YYYY-MM (IST offset, matches admin-billing-analytics-service). */
function monthKeyBillingTz(date: Date): string {
  const local = new Date(date.getTime() + BILLING_TZ_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Start (UTC instant) of the billing-tz month containing `date`. */
function billingMonthStart(date: Date): Date {
  const local = new Date(date.getTime() + BILLING_TZ_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BILLING_TZ_OFFSET_MS
  );
}

function isSuccessfulCall(record: AIUsageRecord): boolean {
  return record.invocationStatus === AI_USAGE_INVOCATION_STATUS.SUCCEEDED;
}

function microToNumber(micro: bigint): number {
  return micro > BigInt(0) ? Number(microToUsdString(micro)) : 0;
}

// ---------------------------------------------------------------------------
// Provider-reported costs (OpenAI, Anthropic, xAI, Runway, ElevenLabs, Gemini billing export)
// ---------------------------------------------------------------------------

export type AiCostSource = "provider" | "estimated";

type ProviderCoverage = { from: Date; through: Date; lastSyncAt: Date | null };

let inFlightSync: Promise<void> | null = null;

/**
 * Sync window: whole billing months for the dashboard trend, widened to the preceding UTC
 * midnight because provider cost buckets are UTC days.
 */
function providerSyncWindowStart(now: Date): Date {
  const local = new Date(now.getTime() + BILLING_TZ_OFFSET_MS);
  const firstMonth = billingMonthStart(
    new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (PROVIDER_SYNC_MONTHS - 1), 15)
    )
  );
  const utcMidnight = new Date(firstMonth);
  utcMidnight.setUTCHours(0, 0, 0, 0);
  return utcMidnight;
}

async function loadProviderCoverage(): Promise<Map<string, ProviderCoverage>> {
  const docs = await ProviderBillingSyncStateModel.find({
    lastSuccessfulSyncAt: { $exists: true, $ne: null },
    providerDataFrom: { $exists: true, $ne: null },
  }).lean();
  const coverage = new Map<string, ProviderCoverage>();
  for (const doc of docs) {
    const row = doc as {
      providerId: string;
      providerDataFrom?: string;
      providerDataThrough?: string;
      lastSuccessfulSyncAt?: string;
    };
    const from = Date.parse(row.providerDataFrom ?? "");
    const through = Date.parse(row.providerDataThrough ?? "");
    if (!Number.isFinite(from) || !Number.isFinite(through)) continue;
    const lastSync = Date.parse(row.lastSuccessfulSyncAt ?? "");
    const prev = coverage.get(row.providerId);
    coverage.set(row.providerId, {
      from: new Date(Math.min(from, prev?.from.getTime() ?? from)),
      through: new Date(Math.max(through, prev?.through.getTime() ?? through)),
      lastSyncAt: Number.isFinite(lastSync) ? new Date(lastSync) : prev?.lastSyncAt ?? null,
    });
  }
  return coverage;
}

/**
 * Pull provider cost reports when stale. The first-ever sync is awaited (bounded) so the
 * dashboard shows provider numbers on first load; later refreshes run in the background.
 */
export async function ensureProviderBillingFresh(): Promise<void> {
  const service = getProviderBillingSyncService();
  const configured = service.configuredProviderIds();
  if (!configured.length) return;

  const coverage = await loadProviderCoverage();
  const now = Date.now();
  const windowStart = providerSyncWindowStart(new Date(now));
  const needsSync = configured.some((providerId) => {
    const row = coverage.get(providerId);
    if (!row?.lastSyncAt) return true;
    if (row.from.getTime() > windowStart.getTime()) return true;
    return now - row.lastSyncAt.getTime() > PROVIDER_SYNC_TTL_MS;
  });
  if (!needsSync) return;

  if (!inFlightSync) {
    inFlightSync = service
      .syncConfiguredProviders({
        startTimeSec: Math.floor(windowStart.getTime() / 1000),
        endTimeSec: Math.floor(now / 1000),
      })
      .then(() => invalidateAdminCache())
      .catch((error) => logAccountingError("admin_provider_billing_refresh", error, {}))
      .finally(() => {
        inFlightSync = null;
      });
  }

  const neverSynced = configured.some((providerId) => !coverage.get(providerId)?.lastSyncAt);
  if (neverSynced) {
    await Promise.race([
      inFlightSync,
      new Promise((resolve) => setTimeout(resolve, PROVIDER_FIRST_SYNC_WAIT_MS)),
    ]);
  }
}

/** Provider-reported USD (micro) per provider and per billing month, for buckets in range. */
async function loadProviderReportedMicro(range: { start: Date; end: Date }): Promise<{
  byProvider: Map<string, bigint>;
  byProviderMonth: Map<string, Map<string, bigint>>;
}> {
  const docs = await ProviderBillingLineModel.find({
    bucketStart: { $gte: range.start.toISOString(), $lt: range.end.toISOString() },
    currency: { $in: ["USD", "usd"] },
  })
    .select("providerId amount bucketStart")
    .lean();

  const byProvider = new Map<string, bigint>();
  const byProviderMonth = new Map<string, Map<string, bigint>>();
  for (const doc of docs) {
    const row = doc as { providerId: string; amount?: string; bucketStart?: string };
    const micro = parseUsdToMicro(row.amount ?? null);
    const ts = Date.parse(row.bucketStart ?? "");
    if (micro == null || !Number.isFinite(ts)) continue;
    byProvider.set(row.providerId, (byProvider.get(row.providerId) ?? BigInt(0)) + micro);
    const months = byProviderMonth.get(row.providerId) ?? new Map<string, bigint>();
    const key = monthKeyBillingTz(new Date(ts));
    months.set(key, (months.get(key) ?? BigInt(0)) + micro);
    byProviderMonth.set(row.providerId, months);
  }
  return { byProvider, byProviderMonth };
}

/**
 * Providers whose synced cost report covers `start`. Provider reports are org-wide, so they
 * are only used for platform-wide (cross-tenant) totals, never for a single customer org.
 */
function providersCoveringFrom(
  coverage: Map<string, ProviderCoverage>,
  start: Date
): Set<string> {
  const covered = new Set<string>();
  for (const [providerId, row] of coverage.entries()) {
    if (row.from.getTime() <= start.getTime()) covered.add(providerId);
  }
  return covered;
}

export type ProviderCostEntry = {
  /** USD. Provider-reported when source === "provider", else metered estimate. */
  amount: number;
  /** Ledger-metered USD estimate (tokens/units × rate card), kept for comparison. */
  estimatedAmount: number;
  /** Successful provider calls metered by the ledger (failed calls excluded). */
  count: number;
  source: AiCostSource;
};

export async function sumLedgerAiCostUsd(input: {
  readonly period?: string;
  readonly organizationId?: string;
  readonly start?: Date;
  readonly end?: Date;
}): Promise<{
  aiCostUsd: number;
  providerReportedUsd: number;
  estimatedUsd: number;
  requestCount: number;
  byProvider: Map<string, ProviderCostEntry>;
  overview: Awaited<ReturnType<AICostAnalyticsService["buildAnalytics"]>>["overview"];
}> {
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: input.organizationId,
    customRange:
      input.start && input.end ? { start: input.start, end: input.end } : undefined,
  });

  const byProvider = new Map<string, ProviderCostEntry>();
  const records = input.start && input.end
    ? await ledger.listRecords({
        start: input.start,
        end: input.end,
        organizationId: input.organizationId,
      })
    : [];
  const successByProvider = new Map<string, number>();
  for (const record of records) {
    if (!isSuccessfulCall(record)) continue;
    successByProvider.set(record.providerId, (successByProvider.get(record.providerId) ?? 0) + 1);
  }
  for (const row of bundle.byProvider) {
    const estimated = Number(row.spendUsd ?? 0);
    byProvider.set(row.providerId, {
      amount: estimated,
      estimatedAmount: estimated,
      count: successByProvider.get(row.providerId) ?? row.requestCount,
      source: "estimated",
    });
  }

  // Platform-wide totals: replace estimates with the providers' own cost reports.
  if (!input.organizationId && input.start && input.end) {
    const coverage = await loadProviderCoverage();
    const covered = providersCoveringFrom(coverage, input.start);
    if (covered.size) {
      const reported = await loadProviderReportedMicro({ start: input.start, end: input.end });
      for (const providerId of covered) {
        const prev = byProvider.get(providerId);
        byProvider.set(providerId, {
          amount: microToNumber(reported.byProvider.get(providerId) ?? BigInt(0)),
          estimatedAmount: prev?.estimatedAmount ?? 0,
          count: prev?.count ?? 0,
          source: "provider",
        });
      }
    }
  }

  let providerReportedUsd = 0;
  let estimatedUsd = 0;
  for (const entry of byProvider.values()) {
    if (entry.source === "provider") providerReportedUsd += entry.amount;
    else estimatedUsd += entry.amount;
  }
  const aiCostUsd = providerReportedUsd + estimatedUsd;

  return {
    aiCostUsd: Number.isFinite(aiCostUsd) ? aiCostUsd : 0,
    providerReportedUsd,
    estimatedUsd,
    requestCount: [...successByProvider.values()].reduce((a, b) => a + b, 0),
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

    if (isSuccessfulCall(record)) {
      countByOrg.set(organizationId, (countByOrg.get(organizationId) ?? 0) + 1);
    }
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

  const coverage = input.organizationId
    ? new Map<string, ProviderCoverage>()
    : await loadProviderCoverage();
  const reported = coverage.size
    ? await loadProviderReportedMicro({ start: input.start, end: input.end })
    : null;
  // A provider's month uses its cost report only when the synced window covers the whole month.
  const usesProviderReport = (providerId: string, at: Date): boolean => {
    const row = coverage.get(providerId);
    if (!row || !reported) return false;
    return row.from.getTime() <= billingMonthStart(at).getTime();
  };

  const microByMonth = new Map<string, bigint>();
  if (reported) {
    for (const [providerId, months] of reported.byProviderMonth.entries()) {
      for (const [key, micro] of months.entries()) {
        const [y, m] = key.split("-").map(Number);
        const monthStartAt = new Date(Date.UTC(y, m - 1, 1) - BILLING_TZ_OFFSET_MS);
        if (!usesProviderReport(providerId, monthStartAt)) continue;
        microByMonth.set(key, (microByMonth.get(key) ?? BigInt(0)) + micro);
      }
    }
  }

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
    if (usesProviderReport(record.providerId, new Date(completedAt))) continue;
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
