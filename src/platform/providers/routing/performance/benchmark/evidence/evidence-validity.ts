/**
 * Step 8 — Evidence validity filters for model comparison.
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import { isFairModelComparisonOutcome } from "../contracts/benchmark-outcome";

export function isControlledEvidenceRecord(record: ModelPerformanceRecord): boolean {
  return record.evidenceMode === "controlled" && record.evidenceSource === "benchmark";
}

export function isObservationalProductionRecord(record: ModelPerformanceRecord): boolean {
  return record.evidenceMode === "observational" && record.evidenceSource === "production";
}

export function filterControlledRecords(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return records.filter(isControlledEvidenceRecord);
}

export function filterObservationalProductionRecords(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return records.filter(isObservationalProductionRecord);
}

export function isValidComparisonRecord(record: ModelPerformanceRecord): boolean {
  return (
    isControlledEvidenceRecord(record) &&
    record.validForModelComparison === true &&
    isFairModelComparisonOutcome(record.benchmarkOutcome)
  );
}

/** Controlled benchmark evidence eligible for fair model/strategy/knowledge comparison. */
export function filterControlledComparisonRecords(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return records.filter(isValidComparisonRecord);
}

export function isOperationalFailureRecord(record: ModelPerformanceRecord): boolean {
  return (
    record.benchmarkOutcome === "PROVIDER_OPERATIONAL_FAILURE" ||
    record.reliabilityStatus === "operational_failure"
  );
}

export function isExecutorCapabilityFailure(record: ModelPerformanceRecord): boolean {
  return (
    record.benchmarkOutcome === "EXECUTION_CAPABILITY_UNAVAILABLE" ||
    record.benchmarkOutcome === "MODEL_CAPABILITY_UNSUPPORTED" ||
    record.benchmarkOutcome === "VALIDATION_UNAVAILABLE"
  );
}

export function filterValidComparisonRecords(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return records.filter(isValidComparisonRecord);
}

export function filterOperationalFailureRecords(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return records.filter(isOperationalFailureRecord);
}

export function separateEvidenceQuality(
  records: readonly ModelPerformanceRecord[],
): {
  readonly validComparison: readonly ModelPerformanceRecord[];
  readonly operationalFailures: readonly ModelPerformanceRecord[];
  readonly capabilityFailures: readonly ModelPerformanceRecord[];
  readonly other: readonly ModelPerformanceRecord[];
} {
  const validComparison: ModelPerformanceRecord[] = [];
  const operationalFailures: ModelPerformanceRecord[] = [];
  const capabilityFailures: ModelPerformanceRecord[] = [];
  const other: ModelPerformanceRecord[] = [];

  for (const record of records) {
    if (isValidComparisonRecord(record)) {
      validComparison.push(record);
    } else if (isOperationalFailureRecord(record)) {
      operationalFailures.push(record);
    } else if (isExecutorCapabilityFailure(record)) {
      capabilityFailures.push(record);
    } else {
      other.push(record);
    }
  }

  return Object.freeze({
    validComparison: Object.freeze(validComparison),
    operationalFailures: Object.freeze(operationalFailures),
    capabilityFailures: Object.freeze(capabilityFailures),
    other: Object.freeze(other),
  });
}
