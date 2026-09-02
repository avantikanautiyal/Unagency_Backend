/**
 * Step 8 — Performance intelligence query service.
 * Extends Step 3 query capabilities with specialization and coverage analysis.
 */

import type { ModelPerformanceRecord, PerformanceFingerprint } from "../contracts/model-performance-record";
import type { PerformanceRecordQuery, IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import {
  aggregatePerformance,
  aggregateRecordsInMemory,
  type AggregationLevel,
} from "../intelligence/performance-aggregator";
import { filterValidComparisonRecords } from "./evidence-validity";
import { auditEvidenceCoverage, type EvidenceCoverageReport } from "./evidence-coverage";
import {
  compareModelsAtScope,
  detectSpecializations,
  findMaterialDifferences,
  strongestAreas,
  weakestAreas,
  type ModelComparisonResult,
  type SpecializationCandidate,
} from "./specialization-detector";
import {
  buildPerformanceIntelligenceReport,
  formatCoverageReport,
  formatModelComparisonReport,
  formatSpecializationReport,
  type PerformanceIntelligenceReport,
} from "./performance-intelligence-report";
import {
  detectRegressions,
  selectBaselineRecords,
  type BaselineReference,
  type RegressionReport,
} from "../intelligence/regression-detector";
import { listBenchmarkCases } from "../catalog/benchmark-catalog";
import type { SpecializationThresholds } from "./evidence-collection-config";

export type PerformanceIntelligenceService = {
  aggregateFingerprints(
    query: PerformanceRecordQuery,
    level?: AggregationLevel,
  ): Promise<readonly PerformanceFingerprint[]>;
  modelPerformanceForService(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly service: string;
    readonly industry?: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  modelPerformanceForIndustry(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  modelPerformanceForServiceAndIndustry(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly service: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  modelPerformanceForComplexity(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly complexity: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  modelPerformanceForStrategy(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyId: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  strongestAreas(query?: PerformanceRecordQuery, limit?: number): Promise<readonly SpecializationCandidate[]>;
  weakestAreas(query?: PerformanceRecordQuery, limit?: number): Promise<readonly SpecializationCandidate[]>;
  dominantFailureCategories(input: PerformanceRecordQuery): Promise<Readonly<Record<string, number>>>;
  evidenceCoverage(input?: {
    readonly organizationId?: string;
    readonly models?: readonly { readonly providerId: string; readonly modelId: string }[];
  }): Promise<EvidenceCoverageReport>;
  compareModels(input: {
    readonly modelA: { readonly providerId: string; readonly modelId: string };
    readonly modelB: { readonly providerId: string; readonly modelId: string };
    readonly query?: PerformanceRecordQuery;
    readonly aggregationLevel?: AggregationLevel;
  }): Promise<readonly ModelComparisonResult[]>;
  compareStrategies(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyA: string;
    readonly strategyB: string;
    readonly query?: PerformanceRecordQuery;
  }): Promise<readonly ModelComparisonResult[]>;
  detectRegressions(
    baseline: BaselineReference,
    candidateProviderId: string,
    candidateModelId: string,
    query?: PerformanceRecordQuery,
  ): Promise<RegressionReport>;
  detectSpecializations(
    query?: PerformanceRecordQuery,
    level?: AggregationLevel,
    thresholds?: SpecializationThresholds,
  ): Promise<readonly SpecializationCandidate[]>;
  buildReport(fingerprint: PerformanceFingerprint): PerformanceIntelligenceReport;
  formatCoverage(report: EvidenceCoverageReport): string;
  formatSpecializations(candidates: readonly SpecializationCandidate[]): string;
  formatComparisons(comparisons: readonly ModelComparisonResult[]): string;
  modelsWithSufficientEvidence(input: {
    readonly service?: string;
    readonly industry?: string;
    readonly minValidSamples?: number;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
};

export function createPerformanceIntelligenceService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
}): PerformanceIntelligenceService {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;

  async function queryAll(query?: PerformanceRecordQuery): Promise<readonly ModelPerformanceRecord[]> {
    return store.query({ ...query, limit: 10_000 });
  }

  return Object.freeze({
    aggregateFingerprints: (query, level = 2) => aggregatePerformance(store, query, level),

    modelPerformanceForService: async (input) => {
      const records = await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      const fps = aggregateRecordsInMemory(records, input.industry ? 4 : 2);
      return fps[0];
    },

    modelPerformanceForIndustry: async (input) => {
      const records = await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(records, 4);
    },

    modelPerformanceForServiceAndIndustry: async (input) => {
      const records = await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(records, 4)[0];
    },

    modelPerformanceForComplexity: async (input) => {
      const records = await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        complexity: input.complexity,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(records, 5);
    },

    modelPerformanceForStrategy: async (input) => {
      const records = await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        strategyId: input.strategyId,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(records, 6);
    },

    strongestAreas: async (query, limit = 5) => {
      const records = await queryAll(query);
      const fps = aggregateRecordsInMemory(filterValidComparisonRecords(records), 4);
      return strongestAreas(fps, limit);
    },

    weakestAreas: async (query, limit = 5) => {
      const records = await queryAll(query);
      const fps = aggregateRecordsInMemory(filterValidComparisonRecords(records), 4);
      return weakestAreas(fps, limit);
    },

    dominantFailureCategories: async (input) => {
      const records = await queryAll(input);
      const profile: Record<string, number> = {};
      for (const r of records) {
        for (const [cat, count] of Object.entries(r.failureCategories)) {
          profile[cat] = (profile[cat] ?? 0) + count;
        }
      }
      return Object.freeze(profile);
    },

    evidenceCoverage: async (input) => {
      const records = await queryAll({ organizationId: input?.organizationId });
      return auditEvidenceCoverage({
        records,
        benchmarkCases: listBenchmarkCases(),
        models: input?.models,
      });
    },

    compareModels: async (input) => {
      const records = await queryAll(input.query);
      return compareModelsAtScope({
        records,
        modelA: input.modelA,
        modelB: input.modelB,
        aggregationLevel: input.aggregationLevel as 2 | 4 | 5 | 6 | undefined,
      });
    },

    compareStrategies: async (input) => {
      const records = await queryAll({
        ...input.query,
        providerId: input.providerId,
        modelId: input.modelId,
      });
      const strategyARecords = records.filter((r) => r.strategyId === input.strategyA);
      const strategyBRecords = records.filter((r) => r.strategyId === input.strategyB);
      const fpA = aggregateRecordsInMemory(filterValidComparisonRecords(strategyARecords), 6)[0];
      const fpB = aggregateRecordsInMemory(filterValidComparisonRecords(strategyBRecords), 6)[0];
      if (!fpA || !fpB) {
        return Object.freeze([
          Object.freeze({
            status: "INSUFFICIENT_EVIDENCE" as const,
            modelA: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            modelB: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            scope: `${input.strategyA} vs ${input.strategyB}`,
            compatibility: Object.freeze({ compatible: false, reasons: Object.freeze(["insufficient strategy evidence"]) }),
            tradeOffs: Object.freeze([]),
            reason: "Insufficient strategy comparison evidence",
          }),
        ]);
      }
      return compareModelsAtScope({
        records: [
          ...strategyARecords.map((r) => ({ ...r, modelId: `${input.modelId}@${input.strategyA}` })),
          ...strategyBRecords.map((r) => ({ ...r, modelId: `${input.modelId}@${input.strategyB}` })),
        ] as ModelPerformanceRecord[],
        modelA: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.strategyA}` }),
        modelB: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.strategyB}` }),
        aggregationLevel: 6,
      });
    },

    detectRegressions: async (baseline, candidateProviderId, candidateModelId, query) => {
      const allRecords = await queryAll(query);
      const baselineRecords = selectBaselineRecords(allRecords, baseline);
      const candidateRecords = allRecords.filter(
        (r) => r.providerId === candidateProviderId && r.modelId === candidateModelId,
      );
      return detectRegressions({
        baselineRecords: filterValidComparisonRecords(baselineRecords),
        candidateRecords: filterValidComparisonRecords(candidateRecords),
      });
    },

    detectSpecializations: async (query, level = 4, thresholds) => {
      const records = await queryAll(query);
      const fps = aggregateRecordsInMemory(filterValidComparisonRecords(records), level);
      return detectSpecializations({ fingerprints: fps, thresholds });
    },

    buildReport: buildPerformanceIntelligenceReport,
    formatCoverage: formatCoverageReport,
    formatSpecializations: formatSpecializationReport,
    formatComparisons: formatModelComparisonReport,

    modelsWithSufficientEvidence: async (input) => {
      const minValid = input.minValidSamples ?? 3;
      const records = await queryAll({
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
      });
      const fps = aggregateRecordsInMemory(records, input.industry ? 4 : 2);
      return fps.filter(
        (fp) =>
          fp.validComparisonSamples >= minValid && fp.confidence.level !== "insufficient",
      );
    },
  });
}

export const defaultPerformanceIntelligenceService = createPerformanceIntelligenceService();

export { findMaterialDifferences };
