/**
 * In-process accounting observability counters (financial failure detection).
 */

export interface AccountingMetricsSnapshot {
  readonly usageRecordsCreated: number;
  readonly usageRecordsDeduplicated: number;
  readonly usageRecordsUpdated: number;
  readonly pendingPricingRecords: number;
  readonly pendingProviderUsageRecords: number;
  readonly accountingFailures: number;
  readonly reconciliationMismatches: number;
  readonly providerBillingSyncFailures: number;
  readonly unknownProviders: number;
  readonly unknownModels: number;
  readonly ledgerWriteLatencyMsTotal: number;
  readonly ledgerWriteCount: number;
}

const counters = {
  usageRecordsCreated: 0,
  usageRecordsDeduplicated: 0,
  usageRecordsUpdated: 0,
  pendingPricingRecords: 0,
  pendingProviderUsageRecords: 0,
  accountingFailures: 0,
  reconciliationMismatches: 0,
  providerBillingSyncFailures: 0,
  unknownProviders: 0,
  unknownModels: 0,
  ledgerWriteLatencyMsTotal: 0,
  ledgerWriteCount: 0,
};

export function incrementAccountingMetric(
  key: keyof typeof counters,
  amount = 1
): void {
  counters[key] += amount;
}

export function recordLedgerWriteLatency(ms: number): void {
  counters.ledgerWriteLatencyMsTotal += ms;
  counters.ledgerWriteCount += 1;
}

export function getAccountingMetrics(): AccountingMetricsSnapshot {
  return { ...counters };
}

export function resetAccountingMetricsForTests(): void {
  for (const key of Object.keys(counters) as (keyof typeof counters)[]) {
    counters[key] = 0;
  }
}

export function logAccountingError(context: string, error: unknown, meta?: Record<string, unknown>): void {
  incrementAccountingMetric("accountingFailures");
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      component: "ai_accounting",
      context,
      message,
      ...meta,
      at: new Date().toISOString(),
    })
  );
}
