/**
 * Priority 4.3 — Evidence scope keys and slice grouping.
 */

import type { ModelPerformanceRecord } from "../../contracts/model-performance-record";
import type { EvidenceReadinessScope } from "./evidence-readiness-contract";

export function buildEvidenceScopeKey(record: ModelPerformanceRecord): string {
  return [
    record.service,
    record.subtype,
    record.industry ?? "*",
    record.outputKind,
    record.complexity,
    record.strategyId,
  ].join("|");
}

export function scopeFromRecord(record: ModelPerformanceRecord): EvidenceReadinessScope {
  const scopeKey = buildEvidenceScopeKey(record);
  return Object.freeze({
    service: record.service,
    subtype: record.subtype,
    industry: record.industry,
    modality: record.outputKind,
    complexity: record.complexity,
    strategyId: record.strategyId,
    scopeKey,
  });
}

export function groupRecordsByEvidenceScope(
  records: readonly ModelPerformanceRecord[],
): ReadonlyMap<string, readonly ModelPerformanceRecord[]> {
  const map = new Map<string, ModelPerformanceRecord[]>();
  for (const record of records) {
    const key = buildEvidenceScopeKey(record);
    const bucket = map.get(key) ?? [];
    bucket.push(record);
    map.set(key, bucket);
  }
  return map;
}
