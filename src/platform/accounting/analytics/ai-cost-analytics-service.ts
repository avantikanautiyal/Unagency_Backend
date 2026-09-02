/**
 * AI cost analytics — aggregates canonical usage ledger for admin dashboards.
 */

import { AIUsageRecordModel } from "../../infrastructure/durability/mongo/models/ai-usage-record.model";
import type { AIUsageRecord } from "../contracts/ai-usage-record";
import { isCostKnown } from "../contracts/ai-usage-record";
import {
  billingPeriodBoundsForDate,
  resolveAdminPeriodRange,
  type AdminPeriodFilter,
  type ResolvedPeriodRange,
} from "../contracts/billing-period";
import { parseUsdToMicro, microToUsdString, addUsd } from "../money/usd-money";
import { projectCurrentPeriodSpend } from "../analytics/projection";
import { getBillingReconciliationService } from "../reconciliation/billing-reconciliation-service";
import type { IUsageLedger } from "../ledger/usage-ledger";
import { MongoUsageLedger } from "../ledger/usage-ledger";

export interface AICostOverview {
  readonly liveInternalSpendUsd: string | null;
  readonly estimatedSpendUsd: string | null;
  readonly providerReconciledSpendUsd: string | null;
  readonly pendingSpendUsd: string | null;
  readonly unreconciledSpendUsd: string | null;
  readonly varianceUsd: string | null;
  readonly projectedSpendUsd: string | null;
  readonly projectionStatus: string | null;
  readonly requestCount: number;
  readonly successfulRequestCount: number;
  readonly failedRequestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
  readonly lastUsageUpdateAt: string | null;
  readonly lastProviderReconciliationAt: string | null;
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

function spendFromRecord(record: AIUsageRecord): string | null {
  if (!isCostKnown(record.cost.costStatus)) return null;
  return record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd;
}

async function loadRecords(range: ResolvedPeriodRange, organizationId?: string): Promise<AIUsageRecord[]> {
  const query: Record<string, unknown> = {
    completedAt: {
      $gte: range.start.toISOString(),
      $lt: range.end.toISOString(),
    },
  };
  if (organizationId) query.organizationId = organizationId;
  const docs = await AIUsageRecordModel.find(query).lean();
  return docs as unknown as AIUsageRecord[];
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
    const records = await loadRecords(range, input.organizationId);
    const aggregate = await this.ledger.aggregateSpend({
      start: range.start,
      end: range.end,
      organizationId: input.organizationId,
    });

    const currentMonthBounds = billingPeriodBoundsForDate(new Date());
    const projection = projectCurrentPeriodSpend({
      currentKnownSpendUsd: aggregate.liveInternalSpendUsd,
      now: new Date(),
    });

    const reconciliation = getBillingReconciliationService();
    const syncStates = [...new Set(records.map((r) => r.providerId))].map((providerId) =>
      reconciliation.getSyncState(providerId)
    );
    const lastProviderReconciliationAt =
      syncStates
        .map((s) => s.lastSuccessfulSyncAt)
        .filter(Boolean)
        .sort()
        .pop() ?? null;
    const providerDataThrough =
      syncStates
        .map((s) => s.providerDataThrough)
        .filter(Boolean)
        .sort()
        .pop() ?? null;

    const byProvider = this.buildProviderBreakdown(records);
    const byModel = this.buildModelBreakdown(records);
    const byService = this.buildServiceBreakdown(records);

    return {
      overview: {
        liveInternalSpendUsd: aggregate.liveInternalSpendUsd,
        estimatedSpendUsd: aggregate.liveInternalSpendUsd,
        providerReconciledSpendUsd: null,
        pendingSpendUsd: aggregate.pendingSpendUsd,
        unreconciledSpendUsd: aggregate.liveInternalSpendUsd,
        varianceUsd: null,
        projectedSpendUsd: projection.projectedSpendUsd,
        projectionStatus: projection.projectionStatus,
        requestCount: aggregate.requestCount,
        successfulRequestCount: aggregate.successfulRequestCount,
        failedRequestCount: aggregate.failedRequestCount,
        inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens,
        cachedTokens: aggregate.cachedTokens,
        reasoningTokens: aggregate.reasoningTokens,
        lastUsageUpdateAt: await this.ledger.lastUsageUpdateAt(),
        lastProviderReconciliationAt,
        providerDataThrough,
      },
      byProvider,
      byModel,
      byService,
    };
  }

  private buildProviderBreakdown(records: readonly AIUsageRecord[]): ProviderCostRow[] {
    const totals = new Map<string, { spend: string | null; requests: number; inTok: number; outTok: number }>();
    let overallMicro = BigInt(0);

    for (const record of records) {
      const key = record.providerId;
      const row = totals.get(key) ?? { spend: null, requests: 0, inTok: 0, outTok: 0 };
      row.requests += 1;
      row.inTok += record.usage.inputTokens ?? 0;
      row.outTok += record.usage.outputTokens ?? 0;
      const amount = spendFromRecord(record);
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

  private buildModelBreakdown(records: readonly AIUsageRecord[]): ModelCostRow[] {
    const totals = new Map<
      string,
      { providerId: string; modelId: string; spend: string | null; requests: number; inTok: number; outTok: number; cached: number }
    >();

    for (const record of records) {
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
      const amount = spendFromRecord(record);
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

  private buildServiceBreakdown(records: readonly AIUsageRecord[]): ServiceCostRow[] {
    const totals = new Map<string, { spend: string | null; requests: number }>();
    for (const record of records) {
      const service = record.service ?? record.capabilityId;
      const row = totals.get(service) ?? { spend: null, requests: 0 };
      row.requests += 1;
      const amount = spendFromRecord(record);
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
