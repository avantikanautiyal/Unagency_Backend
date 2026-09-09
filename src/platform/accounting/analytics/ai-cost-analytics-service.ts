/**
 * AI cost analytics — aggregates canonical usage ledger for admin dashboards.
 */

import type { AIUsageRecord } from "../contracts/ai-usage-record";
import {
  billingPeriodBoundsForDate,
  resolveAdminPeriodRange,
  type AdminPeriodFilter,
  type ResolvedPeriodRange,
} from "../contracts/billing-period";
import { parseUsdToMicro, microToUsdString, addUsd } from "../money/usd-money";
import { projectCurrentPeriodSpend } from "../analytics/projection";
import { ProviderBillingSyncStateModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-sync-state.model";
import { ProviderBillingLineModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-line.model";
import type { IUsageLedger } from "../ledger/usage-ledger";
import { MongoUsageLedger } from "../ledger/usage-ledger";
import {
  aggregateEligibleRecords,
  liveAmountUsd,
  verifyBreakdownReconciles,
  addLiveAmounts,
} from "../eligibility/accounting-eligibility";
import { logAccountingError } from "../observability/accounting-metrics";

export interface AICostOverview {
  /** CALCULATED + RECONCILED spend — real-time internal ledger. */
  readonly liveInternalSpendUsd: string | null;
  /** Alias for liveInternalSpendUsd (legacy field). */
  readonly estimatedSpendUsd: string | null;
  /** Provider billing sync total when available (delayed, NOT real-time). */
  readonly providerReconciledSpendUsd: string | null;
  /** PENDING_* spend with known amounts — never coerced to zero. */
  readonly pendingSpendUsd: string | null;
  /** Live spend not yet matched to provider billing. */
  readonly unreconciledSpendUsd: string | null;
  readonly varianceUsd: string | null;
  /** Extrapolated from live spend; null if <24h elapsed. Never actual spend. */
  readonly projectedSpendUsd: string | null;
  readonly projectionStatus: string | null;
  readonly requestCount: number;
  readonly pendingRequestCount: number;
  readonly successfulRequestCount: number;
  readonly failedRequestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
  readonly lastUsageUpdateAt: string | null;
  /** Last provider billing sync success (delayed data). */
  readonly lastProviderReconciliationAt: string | null;
  /** Through-date of provider billing data (NOT real-time). */
  readonly providerDataThrough: string | null;
}

export interface ProviderCostRow {
  readonly providerId: string;
  readonly spendUsd: string | null;
  readonly requestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly percentageOfTotal: number | null;
}

export interface ModelCostRow {
  readonly providerId: string;
  readonly modelId: string;
  readonly spendUsd: string | null;
  readonly requestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly averageCostUsd: string | null;
}

export interface ServiceCostRow {
  readonly service: string;
  readonly spendUsd: string | null;
  readonly requestCount: number;
  readonly averageCostUsd: string | null;
}

export interface AICostAnalyticsBundle {
  readonly overview: AICostOverview;
  readonly byProvider: readonly ProviderCostRow[];
  readonly byModel: readonly ModelCostRow[];
  readonly byService: readonly ServiceCostRow[];
}

async function loadRecords(
  ledger: IUsageLedger,
  range: ResolvedPeriodRange,
  organizationId?: string
): Promise<readonly AIUsageRecord[]> {
  return ledger.listRecords({
    start: range.start,
    end: range.end,
    organizationId,
  });
}

async function loadProviderBillingTotals(
  range: ResolvedPeriodRange,
  organizationId?: string
): Promise<{ providerReconciledSpendUsd: string | null; varianceUsd: string | null }> {
  void organizationId;
  const match: Record<string, unknown> = {
    bucketStart: {
      $gte: range.start.toISOString(),
      $lt: range.end.toISOString(),
    },
    currency: { $in: ["USD", "usd"] },
  };
  const docs = await ProviderBillingLineModel.find(match).lean();
  let providerMicro = BigInt(0);
  for (const doc of docs) {
    const amount = (doc as { amount?: string }).amount;
    const micro = parseUsdToMicro(amount ?? null);
    if (micro != null) providerMicro += micro;
  }
  return {
    providerReconciledSpendUsd:
      providerMicro > BigInt(0) ? microToUsdString(providerMicro) : null,
    varianceUsd: null,
  };
}

async function loadSyncStateMeta(): Promise<{
  lastProviderReconciliationAt: string | null;
  providerDataThrough: string | null;
}> {
  const docs = await ProviderBillingSyncStateModel.find({ syncStatus: "SUCCESS" }).lean();
  const lastProviderReconciliationAt =
    docs
      .map((d) => (d as { lastSuccessfulSyncAt?: string }).lastSuccessfulSyncAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const providerDataThrough =
    docs
      .map((d) => (d as { providerDataThrough?: string }).providerDataThrough)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  return { lastProviderReconciliationAt, providerDataThrough };
}

export class AICostAnalyticsService {
  constructor(private readonly ledger: IUsageLedger = new MongoUsageLedger()) {}

  async buildAnalytics(input: {
    readonly period?: AdminPeriodFilter;
    readonly organizationId?: string;
    readonly customRange?: { readonly start: Date; readonly end: Date };
  }): Promise<AICostAnalyticsBundle> {
    const range = resolveAdminPeriodRange(
      input.period ?? "current_month",
      new Date(),
      input.customRange
    );
    const records = await loadRecords(this.ledger, range, input.organizationId);
    const aggregate = aggregateEligibleRecords(records, {
      start: range.start,
      end: range.end,
      organizationId: input.organizationId,
    });

    const projection = projectCurrentPeriodSpend({
      currentKnownSpendUsd: aggregate.liveInternalSpendUsd,
      now: new Date(),
    });

    const syncMeta = await loadSyncStateMeta();
    const billingTotals = await loadProviderBillingTotals(range, input.organizationId);

    const byProvider = this.buildProviderBreakdown(records, range, input.organizationId);
    const byModel = this.buildModelBreakdown(records, range, input.organizationId);
    const byService = this.buildServiceBreakdown(records, range, input.organizationId);

    const providerReconciles = verifyBreakdownReconciles(
      aggregate.liveInternalSpendUsd,
      [addLiveAmounts(byProvider.map((r) => r.spendUsd))]
    );
    const modelReconciles = verifyBreakdownReconciles(
      aggregate.liveInternalSpendUsd,
      [addLiveAmounts(byModel.map((r) => r.spendUsd))]
    );
    const serviceReconciles = verifyBreakdownReconciles(
      aggregate.liveInternalSpendUsd,
      [addLiveAmounts(byService.map((r) => r.spendUsd))]
    );
    if (!providerReconciles || !modelReconciles || !serviceReconciles) {
      logAccountingError("dashboard_breakdown_mismatch", new Error("breakdown does not reconcile"), {
        liveInternalSpendUsd: aggregate.liveInternalSpendUsd,
        providerReconciles,
        modelReconciles,
        serviceReconciles,
      });
    }

    let varianceUsd: string | null = null;
    let unreconciledSpendUsd: string | null = aggregate.liveInternalSpendUsd;
    if (billingTotals.providerReconciledSpendUsd) {
      const liveMicro = parseUsdToMicro(aggregate.liveInternalSpendUsd) ?? BigInt(0);
      const providerMicro =
        parseUsdToMicro(billingTotals.providerReconciledSpendUsd) ?? BigInt(0);
      const diff = liveMicro - providerMicro;
      varianceUsd = microToUsdString(diff < BigInt(0) ? -diff : diff);
      unreconciledSpendUsd = aggregate.liveInternalSpendUsd;
    }

    return {
      overview: {
        liveInternalSpendUsd: aggregate.liveInternalSpendUsd,
        estimatedSpendUsd: aggregate.liveInternalSpendUsd,
        providerReconciledSpendUsd: billingTotals.providerReconciledSpendUsd,
        pendingSpendUsd: aggregate.pendingSpendUsd,
        unreconciledSpendUsd,
        varianceUsd,
        projectedSpendUsd: projection.projectedSpendUsd,
        projectionStatus: projection.projectionStatus,
        requestCount: aggregate.requestCount,
        pendingRequestCount: aggregate.pendingRequestCount,
        successfulRequestCount: aggregate.successfulRequestCount,
        failedRequestCount: aggregate.failedRequestCount,
        inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens,
        cachedTokens: aggregate.cachedTokens,
        reasoningTokens: aggregate.reasoningTokens,
        lastUsageUpdateAt: await this.ledger.lastUsageUpdateAt(),
        lastProviderReconciliationAt: syncMeta.lastProviderReconciliationAt,
        providerDataThrough: syncMeta.providerDataThrough,
      },
      byProvider,
      byModel,
      byService,
    };
  }

  private buildProviderBreakdown(
    records: readonly AIUsageRecord[],
    range: ResolvedPeriodRange,
    organizationId?: string
  ): ProviderCostRow[] {
    const filter = { start: range.start, end: range.end, organizationId };
    const totals = new Map<
      string,
      { spend: string | null; requests: number; inTok: number; outTok: number }
    >();
    let overallMicro = BigInt(0);

    for (const record of records) {
      const ts = Date.parse(record.completedAt);
      if (ts < filter.start.getTime() || ts >= filter.end.getTime()) continue;
      if (organizationId && record.organizationId !== organizationId) continue;

      const key = record.providerId;
      const row = totals.get(key) ?? { spend: null, requests: 0, inTok: 0, outTok: 0 };
      row.requests += 1;
      row.inTok += record.usage.inputTokens ?? 0;
      row.outTok += record.usage.outputTokens ?? 0;
      const amount = liveAmountUsd(record);
      if (amount) {
        row.spend = addUsd(row.spend, amount);
        const micro = parseUsdToMicro(amount);
        if (micro) overallMicro += micro;
      }
      totals.set(key, row);
    }

    return [...totals.entries()].map(([providerId, row]) => ({
      providerId,
      spendUsd: row.spend,
      requestCount: row.requests,
      inputTokens: row.inTok,
      outputTokens: row.outTok,
      percentageOfTotal:
        row.spend && overallMicro > BigInt(0)
          ? Number(((parseUsdToMicro(row.spend) ?? BigInt(0)) * BigInt(10000)) / overallMicro) / 100
          : null,
    }));
  }

  private buildModelBreakdown(
    records: readonly AIUsageRecord[],
    range: ResolvedPeriodRange,
    organizationId?: string
  ): ModelCostRow[] {
    const totals = new Map<
      string,
      {
        providerId: string;
        modelId: string;
        spend: string | null;
        requests: number;
        inTok: number;
        outTok: number;
        cached: number;
      }
    >();

    for (const record of records) {
      const ts = Date.parse(record.completedAt);
      if (ts < range.start.getTime() || ts >= range.end.getTime()) continue;
      if (organizationId && record.organizationId !== organizationId) continue;

      const key = `${record.providerId}::${record.modelId}`;
      const row =
        totals.get(key) ??
        {
          providerId: record.providerId,
          modelId: record.modelId,
          spend: null,
          requests: 0,
          inTok: 0,
          outTok: 0,
          cached: 0,
        };
      row.requests += 1;
      row.inTok += record.usage.inputTokens ?? 0;
      row.outTok += record.usage.outputTokens ?? 0;
      row.cached += (record.usage.cachedInputTokens ?? 0) + (record.usage.cachedOutputTokens ?? 0);
      const amount = liveAmountUsd(record);
      if (amount) row.spend = addUsd(row.spend, amount);
      totals.set(key, row);
    }

    return [...totals.values()].map((row) => ({
      providerId: row.providerId,
      modelId: row.modelId,
      spendUsd: row.spend,
      requestCount: row.requests,
      inputTokens: row.inTok,
      outputTokens: row.outTok,
      cachedTokens: row.cached,
      averageCostUsd:
        row.spend && row.requests > 0
          ? microToUsdString((parseUsdToMicro(row.spend) ?? BigInt(0)) / BigInt(row.requests))
          : null,
    }));
  }

  private buildServiceBreakdown(
    records: readonly AIUsageRecord[],
    range: ResolvedPeriodRange,
    organizationId?: string
  ): ServiceCostRow[] {
    const totals = new Map<string, { spend: string | null; requests: number }>();
    for (const record of records) {
      const ts = Date.parse(record.completedAt);
      if (ts < range.start.getTime() || ts >= range.end.getTime()) continue;
      if (organizationId && record.organizationId !== organizationId) continue;

      const service = record.service ?? record.capabilityId;
      const row = totals.get(service) ?? { spend: null, requests: 0 };
      row.requests += 1;
      const amount = liveAmountUsd(record);
      if (amount) row.spend = addUsd(row.spend, amount);
      totals.set(service, row);
    }

    return [...totals.entries()].map(([service, row]) => ({
      service,
      spendUsd: row.spend,
      requestCount: row.requests,
      averageCostUsd:
        row.spend && row.requests > 0
          ? microToUsdString((parseUsdToMicro(row.spend) ?? BigInt(0)) / BigInt(row.requests))
          : null,
    }));
  }
}
