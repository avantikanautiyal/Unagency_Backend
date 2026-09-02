/**
 * Step 9 — Experiment analysis extending Step 8 performance intelligence.
 */

import type { ModelPerformanceRecord, PerformanceFingerprint } from "../../contracts/model-performance-record";
import type { PerformanceRecordQuery, IBenchmarkPerformanceRecordStore } from "../../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../../persistence/benchmark-record-store";
import { aggregateRecordsInMemory } from "../../intelligence/performance-aggregator";
import { filterValidComparisonRecords } from "../../evidence/evidence-validity";
import { resolveEvidenceTier } from "../../evidence/evidence-collection-config";
import {
  checkFairComparison,
  filterFairComparableRecords,
  type ExperimentComparisonMode,
} from "../comparison/fair-comparison";
import {
  buildOptimizationRecommendation,
  selectBestSupportedCandidate,
  type OptimizationRecommendation,
} from "../recommendations/optimization-recommendations";
import type { ModelComparisonResult } from "../../evidence/specialization-detector";
import { compareModelsAtScope } from "../../evidence/specialization-detector";

export type ExperimentAnalysisService = {
  strategyPerformance(query?: PerformanceRecordQuery): Promise<readonly PerformanceFingerprint[]>;
  strategyPerformanceForService(input: {
    readonly strategyId: string;
    readonly service: string;
    readonly industry?: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  strategyPerformanceForIndustry(input: {
    readonly strategyId: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  strategyPerformanceForServiceAndIndustry(input: {
    readonly strategyId: string;
    readonly service: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  strategyPerformanceForComplexity(input: {
    readonly strategyId: string;
    readonly complexity: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  knowledgePerformance(query?: PerformanceRecordQuery): Promise<readonly PerformanceFingerprint[]>;
  knowledgePerformanceForService(input: {
    readonly knowledgeId: string;
    readonly service: string;
    readonly industry?: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  knowledgePerformanceForIndustry(input: {
    readonly knowledgeId: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<readonly PerformanceFingerprint[]>;
  knowledgePerformanceForServiceAndIndustry(input: {
    readonly knowledgeId: string;
    readonly service: string;
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  combinationPerformance(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyId: string;
    readonly knowledgeId: string;
    readonly service?: string;
    readonly industry?: string;
    readonly organizationId?: string;
  }): Promise<PerformanceFingerprint | undefined>;
  compareUnderMode(input: {
    readonly mode: ExperimentComparisonMode;
    readonly baseline: ModelPerformanceRecord;
    readonly candidates: readonly ModelPerformanceRecord[];
  }): readonly ModelPerformanceRecord[];
  compareStrategiesFair(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyA: string;
    readonly strategyB: string;
    readonly query?: PerformanceRecordQuery;
  }): Promise<readonly ModelComparisonResult[]>;
  compareKnowledgeFair(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyId: string;
    readonly knowledgeA: string;
    readonly knowledgeB: string;
    readonly query?: PerformanceRecordQuery;
  }): Promise<readonly ModelComparisonResult[]>;
  recommendBestStrategy(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly service: string;
    readonly industry?: string;
    readonly strategyIds: readonly string[];
    readonly organizationId?: string;
  }): Promise<OptimizationRecommendation>;
  recommendBestKnowledge(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly strategyId: string;
    readonly service: string;
    readonly industry?: string;
    readonly knowledgeIds: readonly string[];
    readonly organizationId?: string;
  }): Promise<OptimizationRecommendation>;
  recommendBestCombination(input: {
    readonly service: string;
    readonly industry?: string;
    readonly candidates: readonly {
      readonly providerId: string;
      readonly modelId: string;
      readonly strategyId: string;
      readonly knowledgeId: string;
      readonly label: string;
    }[];
    readonly organizationId?: string;
  }): Promise<OptimizationRecommendation>;
};

export function createExperimentAnalysisService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
}): ExperimentAnalysisService {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;

  async function queryAll(query?: PerformanceRecordQuery) {
    return store.query({ ...query, limit: 10_000 });
  }

  function knowledgeKey(record: ModelPerformanceRecord): string | undefined {
    return record.knowledgeId ?? record.knowledgeVersion;
  }

  return Object.freeze({
    strategyPerformance: async (query) => {
      const records = filterValidComparisonRecords(await queryAll(query));
      return aggregateRecordsInMemory(records, 6);
    },

    strategyPerformanceForService: async (input) => {
      const records = await store.query({
        strategyId: input.strategyId,
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), input.industry ? 4 : 2)[0];
    },

    strategyPerformanceForIndustry: async (input) => {
      const records = await store.query({
        strategyId: input.strategyId,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 4);
    },

    strategyPerformanceForServiceAndIndustry: async (input) => {
      const records = await store.query({
        strategyId: input.strategyId,
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 4)[0];
    },

    strategyPerformanceForComplexity: async (input) => {
      const records = await store.query({
        strategyId: input.strategyId,
        complexity: input.complexity,
        organizationId: input.organizationId,
        limit: 10_000,
      });
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 5);
    },

    knowledgePerformance: async (query) => {
      const records = filterValidComparisonRecords(await queryAll(query));
      const byKnowledge = new Map<string, ModelPerformanceRecord[]>();
      for (const r of records) {
        const key = knowledgeKey(r) ?? "unknown";
        const list = byKnowledge.get(key) ?? [];
        list.push(r);
        byKnowledge.set(key, list);
      }
      const fps: PerformanceFingerprint[] = [];
      for (const group of byKnowledge.values()) {
        const fp = aggregateRecordsInMemory(group, 6)[0];
        if (fp) fps.push(fp);
      }
      return Object.freeze(fps);
    },

    knowledgePerformanceForService: async (input) => {
      const records = (await store.query({
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      })).filter((r) => r.knowledgeId === input.knowledgeId || r.knowledgeVersion?.startsWith(input.knowledgeId));
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), input.industry ? 4 : 2)[0];
    },

    knowledgePerformanceForIndustry: async (input) => {
      const records = (await store.query({
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      })).filter((r) => r.knowledgeId === input.knowledgeId || r.knowledgeVersion?.startsWith(input.knowledgeId));
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 4);
    },

    knowledgePerformanceForServiceAndIndustry: async (input) => {
      const records = (await store.query({
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      })).filter((r) => r.knowledgeId === input.knowledgeId || r.knowledgeVersion?.startsWith(input.knowledgeId));
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 4)[0];
    },

    combinationPerformance: async (input) => {
      const records = (await store.query({
        providerId: input.providerId,
        modelId: input.modelId,
        strategyId: input.strategyId,
        service: input.service,
        industry: input.industry,
        organizationId: input.organizationId,
        limit: 10_000,
      })).filter(
        (r) =>
          r.knowledgeId === input.knowledgeId ||
          r.knowledgeVersion?.startsWith(input.knowledgeId),
      );
      return aggregateRecordsInMemory(filterValidComparisonRecords(records), 4)[0];
    },

    compareUnderMode: (input) =>
      filterFairComparableRecords(input.mode, input.baseline, input.candidates),

    compareStrategiesFair: async (input) => {
      const records = await queryAll({
        ...input.query,
        providerId: input.providerId,
        modelId: input.modelId,
      });
      const aRecords = records.filter((r) => r.strategyId === input.strategyA);
      const bRecords = records.filter((r) => r.strategyId === input.strategyB);
      const baseline = filterValidComparisonRecords(aRecords)[0];
      const candidate = filterValidComparisonRecords(bRecords)[0];
      if (!baseline || !candidate) {
        return Object.freeze([
          Object.freeze({
            status: "INSUFFICIENT_EVIDENCE" as const,
            modelA: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            modelB: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            scope: `${input.strategyA} vs ${input.strategyB}`,
            compatibility: checkFairComparison({ mode: "strategy", a: baseline ?? aRecords[0]!, b: candidate ?? bRecords[0]! }),
            tradeOffs: Object.freeze([]),
            reason: "Insufficient strategy comparison evidence",
          }),
        ]);
      }
      const fair = checkFairComparison({ mode: "strategy", a: baseline, b: candidate });
      if (!fair.comparable) {
        return Object.freeze([
          Object.freeze({
            status: "INCOMPARABLE" as const,
            modelA: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            modelB: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            scope: `${input.strategyA} vs ${input.strategyB}`,
            compatibility: fair,
            tradeOffs: Object.freeze([]),
            reason: fair.reasons.join("; "),
          }),
        ]);
      }
      return compareModelsAtScope({
        records: [...aRecords, ...bRecords] as ModelPerformanceRecord[],
        modelA: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.strategyA}` }),
        modelB: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.strategyB}` }),
        aggregationLevel: 6,
      });
    },

    compareKnowledgeFair: async (input) => {
      const records = await queryAll({
        ...input.query,
        providerId: input.providerId,
        modelId: input.modelId,
        strategyId: input.strategyId,
      });
      const aRecords = records.filter(
        (r) => r.knowledgeId === input.knowledgeA || r.knowledgeVersion?.startsWith(input.knowledgeA),
      );
      const bRecords = records.filter(
        (r) => r.knowledgeId === input.knowledgeB || r.knowledgeVersion?.startsWith(input.knowledgeB),
      );
      const baseline = filterValidComparisonRecords(aRecords)[0];
      const candidate = filterValidComparisonRecords(bRecords)[0];
      if (!baseline || !candidate) {
        return Object.freeze([
          Object.freeze({
            status: "INSUFFICIENT_EVIDENCE" as const,
            modelA: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            modelB: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            scope: `${input.knowledgeA} vs ${input.knowledgeB}`,
            compatibility: Object.freeze({ compatible: false, reasons: Object.freeze(["insufficient knowledge evidence"]) }),
            tradeOffs: Object.freeze([]),
            reason: "Insufficient knowledge comparison evidence",
          }),
        ]);
      }
      const fair = checkFairComparison({ mode: "knowledge", a: baseline, b: candidate });
      if (!fair.comparable) {
        return Object.freeze([
          Object.freeze({
            status: "INCOMPARABLE" as const,
            modelA: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            modelB: Object.freeze({ providerId: input.providerId, modelId: input.modelId }),
            scope: `${input.knowledgeA} vs ${input.knowledgeB}`,
            compatibility: fair,
            tradeOffs: Object.freeze([]),
            reason: fair.reasons.join("; "),
          }),
        ]);
      }
      return compareModelsAtScope({
        records: [...aRecords, ...bRecords] as ModelPerformanceRecord[],
        modelA: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.knowledgeA}` }),
        modelB: Object.freeze({ providerId: input.providerId, modelId: `${input.modelId}@${input.knowledgeB}` }),
        aggregationLevel: 6,
      });
    },

    recommendBestStrategy: async (input) => {
      const candidates = await Promise.all(
        input.strategyIds.map(async (strategyId) => {
          const fp = await createExperimentAnalysisService({ recordStore: store }).strategyPerformanceForService({
            strategyId,
            service: input.service,
            industry: input.industry,
            organizationId: input.organizationId,
          });
          return Object.freeze({
            label: strategyId,
            candidate: Object.freeze({ strategyId }),
            fingerprint: fp,
          });
        }),
      );
      return selectBestSupportedCandidate(candidates);
    },

    recommendBestKnowledge: async (input) => {
      const candidates = await Promise.all(
        input.knowledgeIds.map(async (knowledgeId) => {
          const fp = await createExperimentAnalysisService({ recordStore: store }).knowledgePerformanceForService({
            knowledgeId,
            service: input.service,
            industry: input.industry,
            organizationId: input.organizationId,
          });
          return Object.freeze({
            label: knowledgeId,
            candidate: Object.freeze({ knowledgeId, strategyId: input.strategyId }),
            fingerprint: fp,
          });
        }),
      );
      return selectBestSupportedCandidate(candidates);
    },

    recommendBestCombination: async (input) => {
      const candidates = await Promise.all(
        input.candidates.map(async (c) => {
          const fp = await createExperimentAnalysisService({ recordStore: store }).combinationPerformance({
            providerId: c.providerId,
            modelId: c.modelId,
            strategyId: c.strategyId,
            knowledgeId: c.knowledgeId,
            service: input.service,
            industry: input.industry,
            organizationId: input.organizationId,
          });
          return Object.freeze({
            label: c.label,
            candidate: Object.freeze({
              providerId: c.providerId,
              modelId: c.modelId,
              strategyId: c.strategyId,
              knowledgeId: c.knowledgeId,
            }),
            fingerprint: fp,
          });
        }),
      );
      return selectBestSupportedCandidate(candidates, {
        minValidSamples: 1,
      });
    },
  });
}

export function observedDifferenceLabel(
  delta: number | undefined,
  tier: ReturnType<typeof resolveEvidenceTier>,
): string {
  if (delta == null) return "Observed difference: n/a";
  return `Observed difference: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} | Evidence: ${tier}`;
}
