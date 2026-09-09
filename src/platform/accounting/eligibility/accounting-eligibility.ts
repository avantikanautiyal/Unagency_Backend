/**
 * Canonical accounting eligibility rules — single predicate for all aggregations.
 *
 * liveInternalSpendUsd:
 *   SUM(reportingAmountUsd) WHERE costStatus IN (CALCULATED, RECONCILED)
 *
 * pendingSpendUsd:
 *   SUM(reportingAmountUsd) WHERE costStatus IN (PENDING_*) AND amount IS NOT NULL
 *   (records with pending status but null amount are counted in pendingRequestCount only)
 *
 * pendingRequestCount:
 *   COUNT(*) WHERE costStatus IN (PENDING_*)
 *
 * Never include pending/null amounts in liveInternalSpendUsd.
 * Never convert pending to zero.
 */

import type { AIUsageRecord } from "../contracts/ai-usage-record";
import { isCostKnown, isCostPending } from "../contracts/ai-usage-record";
import { parseUsdToMicro, microToUsdString, addUsd } from "../money/usd-money";

export interface PeriodFilter {
  readonly start: Date;
  readonly end: Date;
  readonly organizationId?: string;
}

export function isInPeriod(record: AIUsageRecord, filter: PeriodFilter): boolean {
  const ts = Date.parse(record.completedAt);
  if (!Number.isFinite(ts)) return false;
  if (ts < filter.start.getTime() || ts >= filter.end.getTime()) return false;
  if (filter.organizationId && record.organizationId !== filter.organizationId) return false;
  return true;
}

export function liveAmountUsd(record: AIUsageRecord): string | null {
  if (!isCostKnown(record.cost.costStatus)) return null;
  return record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd ?? null;
}

export function pendingAmountUsd(record: AIUsageRecord): string | null {
  if (!isCostPending(record.cost.costStatus)) return null;
  return record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd ?? null;
}

export interface AggregatedEligibilityTotals {
  readonly liveInternalSpendUsd: string | null;
  readonly pendingSpendUsd: string | null;
  readonly pendingRequestCount: number;
  readonly liveRequestCount: number;
  readonly requestCount: number;
  readonly successfulRequestCount: number;
  readonly failedRequestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
}

export function aggregateEligibleRecords(
  records: readonly AIUsageRecord[],
  filter: PeriodFilter
): AggregatedEligibilityTotals {
  let liveMicro = BigInt(0);
  let pendingMicro = BigInt(0);
  let pendingRequestCount = 0;
  let liveRequestCount = 0;
  let requestCount = 0;
  let successfulRequestCount = 0;
  let failedRequestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;

  for (const record of records) {
    if (!isInPeriod(record, filter)) continue;
    requestCount += 1;
    if (record.invocationStatus === "SUCCEEDED") successfulRequestCount += 1;
    else failedRequestCount += 1;

    inputTokens += record.usage.inputTokens ?? 0;
    outputTokens += record.usage.outputTokens ?? 0;
    cachedTokens +=
      (record.usage.cachedInputTokens ?? 0) + (record.usage.cachedOutputTokens ?? 0);
    reasoningTokens += record.usage.reasoningTokens ?? 0;

    const live = liveAmountUsd(record);
    const liveMicroPart = parseUsdToMicro(live);
    if (liveMicroPart != null) {
      liveMicro += liveMicroPart;
      liveRequestCount += 1;
    }

    if (isCostPending(record.cost.costStatus)) {
      pendingRequestCount += 1;
      const pending = pendingAmountUsd(record);
      const pendingMicroPart = parseUsdToMicro(pending);
      if (pendingMicroPart != null) pendingMicro += pendingMicroPart;
    }
  }

  return {
    liveInternalSpendUsd:
      requestCount > 0 && liveMicro > BigInt(0)
        ? microToUsdString(liveMicro)
        : liveMicro === BigInt(0)
          ? requestCount > 0
            ? "0"
            : null
          : microToUsdString(liveMicro),
    pendingSpendUsd: pendingMicro > BigInt(0) ? microToUsdString(pendingMicro) : null,
    pendingRequestCount,
    liveRequestCount,
    requestCount,
    successfulRequestCount,
    failedRequestCount,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
  };
}

export function sumLiveSpend(records: readonly AIUsageRecord[], filter: PeriodFilter): string | null {
  return aggregateEligibleRecords(records, filter).liveInternalSpendUsd;
}

export function verifyBreakdownReconciles(
  overallLiveUsd: string | null,
  breakdownLiveUsd: readonly (string | null)[]
): boolean {
  const expected = parseUsdToMicro(overallLiveUsd) ?? BigInt(0);
  let sum = BigInt(0);
  for (const part of breakdownLiveUsd) {
    const micro = parseUsdToMicro(part);
    if (micro != null) sum += micro;
  }
  return expected === sum;
}

export function addLiveAmounts(values: readonly (string | null)[]): string | null {
  let total: string | null = null;
  for (const value of values) {
    if (value) total = addUsd(total, value);
  }
  return total;
}
