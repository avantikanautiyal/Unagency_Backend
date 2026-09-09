/**
 * Admin AI cost drill-down APIs — ledger-backed, canonical eligibility rules.
 *
 * Spend definitions (see accounting/eligibility/accounting-eligibility.ts):
 * - liveInternalSpendUsd: CALCULATED + RECONCILED with known USD amount
 * - pendingSpendUsd: PENDING_* with known USD amount (never coerced to zero)
 * - projectedSpendUsd: extrapolated from live spend only; never actual spend
 */

import { AICostAnalyticsService } from "../../accounting/analytics/ai-cost-analytics-service";
import type { AdminPeriodFilter } from "../../accounting/contracts/billing-period";
import { resolveAdminPeriodRange } from "../../accounting/contracts/billing-period";
import { deriveExecutionCostSummary } from "../../accounting/cost/execution-cost-deriver";
import { MongoUsageLedger } from "../../accounting/ledger/usage-ledger";
import {
  verifyBreakdownReconciles,
  addLiveAmounts,
} from "../../accounting/eligibility/accounting-eligibility";
import { resolveAdminMetricsFilter } from "./admin-billing-analytics-service";

const analytics = new AICostAnalyticsService();
const ledger = new MongoUsageLedger();

function mapLegacyPeriod(period?: string): AdminPeriodFilter {
  const normalized = (period ?? "mtd").toLowerCase();
  if (normalized === "yearly" || normalized === "year") return "current_year";
  if (normalized === "quarterly" || normalized === "quarter") return "last_3_months";
  return "current_month";
}

function resolveRange(input: {
  readonly period?: string;
  readonly organizationId?: string;
  readonly start?: string;
  readonly end?: string;
}) {
  const customRange =
    input.start && input.end
      ? { start: new Date(input.start), end: new Date(input.end) }
      : undefined;
  return resolveAdminPeriodRange(
    customRange ? "custom" : mapLegacyPeriod(input.period),
    new Date(),
    customRange
  );
}

export async function buildAdminAiCostsOverview(input: {
  readonly roles: readonly string[];
  readonly tenantOrganizationId?: string;
  readonly queryOrganizationId?: string;
  readonly period?: string;
  readonly start?: string;
  readonly end?: string;
}) {
  const filter = resolveAdminMetricsFilter({
    roles: input.roles,
    tenantOrganizationId: input.tenantOrganizationId,
    queryOrganizationId: input.queryOrganizationId,
    period: input.period,
  });
  const range = resolveRange({
    period: input.period,
    organizationId: filter.organizationId,
    start: input.start,
    end: input.end,
  });
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: filter.organizationId,
    customRange: input.start && input.end ? { start: range.start, end: range.end } : undefined,
  });

  const providerTotals = bundle.byProvider.map((row) => row.spendUsd);
  const modelTotals = bundle.byModel.map((row) => row.spendUsd);
  const serviceTotals = bundle.byService.map((row) => row.spendUsd);
  const providerReconciles = verifyBreakdownReconciles(
    bundle.overview.liveInternalSpendUsd,
    [addLiveAmounts(providerTotals)]
  );
  const modelReconciles = verifyBreakdownReconciles(
    bundle.overview.liveInternalSpendUsd,
    [addLiveAmounts(modelTotals)]
  );
  const serviceReconciles = verifyBreakdownReconciles(
    bundle.overview.liveInternalSpendUsd,
    [addLiveAmounts(serviceTotals)]
  );

  return {
    period: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
    },
    organizationId: filter.organizationId ?? null,
    ...bundle.overview,
    breakdownReconciles: providerReconciles && modelReconciles && serviceReconciles,
    breakdownChecks: {
      byProvider: providerReconciles,
      byModel: modelReconciles,
      byService: serviceReconciles,
    },
  };
}

export async function buildAdminAiCostsByProvider(input: {
  readonly roles: readonly string[];
  readonly tenantOrganizationId?: string;
  readonly queryOrganizationId?: string;
  readonly period?: string;
  readonly start?: string;
  readonly end?: string;
}) {
  const filter = resolveAdminMetricsFilter({
    roles: input.roles,
    tenantOrganizationId: input.tenantOrganizationId,
    queryOrganizationId: input.queryOrganizationId,
    period: input.period,
  });
  const range = resolveRange({
    period: input.period,
    organizationId: filter.organizationId,
    start: input.start,
    end: input.end,
  });
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: filter.organizationId,
    customRange: input.start && input.end ? { start: range.start, end: range.end } : undefined,
  });
  return {
    period: { start: range.start.toISOString(), end: range.end.toISOString() },
    organizationId: filter.organizationId ?? null,
    providers: bundle.byProvider,
    totalLiveSpendUsd: bundle.overview.liveInternalSpendUsd,
  };
}

export async function buildAdminAiCostsByModel(input: {
  readonly roles: readonly string[];
  readonly tenantOrganizationId?: string;
  readonly queryOrganizationId?: string;
  readonly period?: string;
  readonly start?: string;
  readonly end?: string;
}) {
  const filter = resolveAdminMetricsFilter({
    roles: input.roles,
    tenantOrganizationId: input.tenantOrganizationId,
    queryOrganizationId: input.queryOrganizationId,
    period: input.period,
  });
  const range = resolveRange({
    period: input.period,
    organizationId: filter.organizationId,
    start: input.start,
    end: input.end,
  });
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: filter.organizationId,
    customRange: input.start && input.end ? { start: range.start, end: range.end } : undefined,
  });
  return {
    period: { start: range.start.toISOString(), end: range.end.toISOString() },
    organizationId: filter.organizationId ?? null,
    models: bundle.byModel,
    totalLiveSpendUsd: bundle.overview.liveInternalSpendUsd,
  };
}

export async function buildAdminAiCostsByService(input: {
  readonly roles: readonly string[];
  readonly tenantOrganizationId?: string;
  readonly queryOrganizationId?: string;
  readonly period?: string;
  readonly start?: string;
  readonly end?: string;
}) {
  const filter = resolveAdminMetricsFilter({
    roles: input.roles,
    tenantOrganizationId: input.tenantOrganizationId,
    queryOrganizationId: input.queryOrganizationId,
    period: input.period,
  });
  const range = resolveRange({
    period: input.period,
    organizationId: filter.organizationId,
    start: input.start,
    end: input.end,
  });
  const bundle = await analytics.buildAnalytics({
    period: input.start && input.end ? "custom" : mapLegacyPeriod(input.period),
    organizationId: filter.organizationId,
    customRange: input.start && input.end ? { start: range.start, end: range.end } : undefined,
  });
  return {
    period: { start: range.start.toISOString(), end: range.end.toISOString() },
    organizationId: filter.organizationId ?? null,
    services: bundle.byService,
    totalLiveSpendUsd: bundle.overview.liveInternalSpendUsd,
  };
}

export async function buildAdminAiCostsForExecution(executionId: string) {
  const records = await ledger.listByExecutionId(executionId);
  const summary = deriveExecutionCostSummary(executionId, records);
  return {
    executionId,
    summary,
    usageRecords: records,
    recordCount: records.length,
  };
}

export async function buildAdminAiCostsForUsageRecord(usageRecordId: string) {
  const record = await ledger.getByUsageRecordId(usageRecordId);
  if (!record) return null;
  return { usageRecord: record };
}
