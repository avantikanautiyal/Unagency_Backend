/**
 * Performance aggregation — multi-level fingerprints with sample counts.
 */

import type {
  ModelPerformanceRecord,
  PerformanceFingerprint,
} from "../contracts/model-performance-record";
import type { PerformanceRecordQuery } from "../persistence/benchmark-record-store";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { buildExtendedFingerprint } from "../evidence/performance-fingerprint-builder";

export type AggregationScope = {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly industry?: string;
  readonly complexity?: string;
  readonly strategyId?: string;
  readonly contractVersion?: string;
  readonly knowledgeVersion?: string;
};

export type AggregationLevel =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;

const LEVEL_FIELDS: Record<AggregationLevel, (keyof AggregationScope)[]> = {
  1: ["providerId", "modelId"],
  2: ["providerId", "modelId", "service"],
  3: ["providerId", "modelId", "service", "subtype"],
  4: ["providerId", "modelId", "service", "industry"],
  5: ["providerId", "modelId", "service", "industry", "complexity"],
  6: ["providerId", "modelId", "service", "industry", "strategyId"],
};

function fingerprintKey(scope: AggregationScope): string {
  return JSON.stringify(scope);
}

function scopeFromRecord(
  record: ModelPerformanceRecord,
  level: AggregationLevel,
): AggregationScope {
  const fields = LEVEL_FIELDS[level];
  const scope: Record<string, string | undefined> = {};
  for (const field of fields) {
    switch (field) {
      case "providerId":
        scope.providerId = record.providerId;
        break;
      case "modelId":
        scope.modelId = record.modelId;
        break;
      case "modelVersion":
        scope.modelVersion = record.modelVersion;
        break;
      case "service":
        scope.service = record.service;
        break;
      case "subtype":
        scope.subtype = record.subtype;
        break;
      case "outputKind":
        scope.outputKind = record.outputKind;
        break;
      case "industry":
        scope.industry = record.industry;
        break;
      case "complexity":
        scope.complexity = record.complexity;
        break;
      case "strategyId":
        scope.strategyId = record.strategyId;
        break;
      case "contractVersion":
        scope.contractVersion = record.contractVersion;
        break;
      case "knowledgeVersion":
        scope.knowledgeVersion = record.knowledgeVersion;
        break;
    }
  }
  return scope as AggregationScope;
}

function aggregateRecords(
  records: readonly ModelPerformanceRecord[],
  scope: AggregationScope,
  coverageRatio?: number,
): PerformanceFingerprint | undefined {
  if (records.length === 0) return undefined;

  const first = records[0]!;
  return buildExtendedFingerprint({
    records,
    scope: Object.freeze({
      providerId: scope.providerId ?? first.providerId,
      modelId: scope.modelId ?? first.modelId,
      modelVersion: scope.modelVersion ?? first.modelVersion,
      service: scope.service ?? first.service,
      subtype: scope.subtype,
      outputKind: scope.outputKind,
      industry: scope.industry,
      complexity: scope.complexity as PerformanceFingerprint["complexity"],
      strategyId: scope.strategyId,
      contractVersion: scope.contractVersion,
      knowledgeVersion: scope.knowledgeVersion,
    }),
    coverageRatio,
  });
}

export function groupRecordsByScope(
  records: readonly ModelPerformanceRecord[],
  level: AggregationLevel,
): Map<string, { scope: AggregationScope; records: ModelPerformanceRecord[] }> {
  const groups = new Map<string, { scope: AggregationScope; records: ModelPerformanceRecord[] }>();

  for (const record of records) {
    const scope = scopeFromRecord(record, level);
    const key = fingerprintKey(scope);
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      groups.set(key, { scope, records: [record] });
    }
  }
  return groups;
}

export async function aggregatePerformance(
  store: IBenchmarkPerformanceRecordStore,
  query: PerformanceRecordQuery,
  level: AggregationLevel = 1,
): Promise<readonly PerformanceFingerprint[]> {
  const records = await store.query({ ...query, limit: 10_000 });
  const groups = groupRecordsByScope(records, level);
  const fingerprints: PerformanceFingerprint[] = [];

  for (const { scope, records: groupRecords } of groups.values()) {
    const fp = aggregateRecords(groupRecords, scope);
    if (fp) fingerprints.push(fp);
  }

  return Object.freeze(fingerprints);
}

export function aggregateRecordsInMemory(
  records: readonly ModelPerformanceRecord[],
  level: AggregationLevel,
): readonly PerformanceFingerprint[] {
  const groups = groupRecordsByScope(records, level);
  const fingerprints: PerformanceFingerprint[] = [];
  for (const { scope, records: groupRecords } of groups.values()) {
    const fp = aggregateRecords(groupRecords, scope);
    if (fp) fingerprints.push(fp);
  }
  return Object.freeze(fingerprints);
}
