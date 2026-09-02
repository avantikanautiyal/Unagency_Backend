/**
 * Append-only benchmark performance record store.
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { EvidenceMode, EvidenceSource } from "../contracts/evidence-provenance";

export type PerformanceRecordQuery = {
  readonly organizationId?: string;
  readonly benchmarkId?: string;
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
  readonly knowledgeId?: string;
  readonly experimentId?: string;
  readonly evidenceSource?: EvidenceSource;
  readonly evidenceMode?: EvidenceMode;
  readonly sinceIso?: string;
  readonly untilIso?: string;
  readonly limit?: number;
};

export interface IBenchmarkPerformanceRecordStore {
  append(record: ModelPerformanceRecord): Promise<"inserted" | "duplicate">;
  get(recordId: string): Promise<ModelPerformanceRecord | undefined>;
  query(query: PerformanceRecordQuery): Promise<readonly ModelPerformanceRecord[]>;
  count(query?: PerformanceRecordQuery): Promise<number>;
}

export class InMemoryBenchmarkPerformanceRecordStore
  implements IBenchmarkPerformanceRecordStore
{
  private readonly byId = new Map<string, ModelPerformanceRecord>();
  private readonly ordered: ModelPerformanceRecord[] = [];

  async append(record: ModelPerformanceRecord): Promise<"inserted" | "duplicate"> {
    if (this.byId.has(record.performanceRecordId)) return "duplicate";
    this.byId.set(record.performanceRecordId, record);
    this.ordered.push(record);
    return "inserted";
  }

  async get(recordId: string): Promise<ModelPerformanceRecord | undefined> {
    return this.byId.get(recordId);
  }

  async query(query: PerformanceRecordQuery): Promise<readonly ModelPerformanceRecord[]> {
    let rows = [...this.ordered];
    if (query.organizationId) {
      rows = rows.filter((r) => r.organizationId === query.organizationId);
    }
    if (query.benchmarkId) rows = rows.filter((r) => r.benchmarkId === query.benchmarkId);
    if (query.providerId) rows = rows.filter((r) => r.providerId === query.providerId);
    if (query.modelId) rows = rows.filter((r) => r.modelId === query.modelId);
    if (query.modelVersion) rows = rows.filter((r) => r.modelVersion === query.modelVersion);
    if (query.service) rows = rows.filter((r) => r.service === query.service);
    if (query.subtype) rows = rows.filter((r) => r.subtype === query.subtype);
    if (query.outputKind) rows = rows.filter((r) => r.outputKind === query.outputKind);
    if (query.industry) rows = rows.filter((r) => r.industry === query.industry);
    if (query.complexity) rows = rows.filter((r) => r.complexity === query.complexity);
    if (query.strategyId) rows = rows.filter((r) => r.strategyId === query.strategyId);
    if (query.contractVersion) {
      rows = rows.filter((r) => r.contractVersion === query.contractVersion);
    }
    if (query.knowledgeVersion) {
      rows = rows.filter((r) => r.knowledgeVersion === query.knowledgeVersion);
    }
    if (query.knowledgeId) {
      rows = rows.filter((r) => r.knowledgeId === query.knowledgeId);
    }
    if (query.experimentId) {
      rows = rows.filter((r) => r.experimentId === query.experimentId);
    }
    if (query.evidenceSource) {
      rows = rows.filter((r) => r.evidenceSource === query.evidenceSource);
    }
    if (query.evidenceMode) {
      rows = rows.filter((r) => r.evidenceMode === query.evidenceMode);
    }
    if (query.sinceIso) rows = rows.filter((r) => r.recordedAt >= query.sinceIso!);
    if (query.untilIso) rows = rows.filter((r) => r.recordedAt <= query.untilIso!);
    rows.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
    return rows.slice(0, query.limit ?? 1000);
  }

  async count(query?: PerformanceRecordQuery): Promise<number> {
    const rows = query ? await this.query({ ...query, limit: 100_000 }) : this.ordered;
    return rows.length;
  }

  clear(): void {
    this.byId.clear();
    this.ordered.length = 0;
  }
}

export const defaultBenchmarkPerformanceRecordStore =
  new InMemoryBenchmarkPerformanceRecordStore();
