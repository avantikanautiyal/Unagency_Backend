/**
 * Step 10 — Production evidence + shadow query extensions (Step 8 intelligence reuse).
 */

import type { ModelPerformanceRecord, PerformanceFingerprint } from "../contracts/model-performance-record";
import type { IBenchmarkPerformanceRecordStore, PerformanceRecordQuery } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import type { IShadowDecisionStore } from "../shadow/shadow-decision-store";
import { defaultShadowDecisionStore } from "../shadow/shadow-decision-store";
import type { ShadowDecision, ShadowDecisionStatus, ShadowDecisionQuery } from "../shadow/shadow-decision-contract";
import {
  filterObservationalProductionRecords,
  separateEvidenceQuality,
} from "../evidence/evidence-validity";
import { aggregateRecordsInMemory } from "../intelligence/performance-aggregator";

export type ProductionIntelligenceQueryService = {
  productionEvidence(query?: PerformanceRecordQuery): Promise<readonly ModelPerformanceRecord[]>;
  productionEvidenceByModel(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly organizationId?: string;
  }): Promise<readonly ModelPerformanceRecord[]>;
  productionEvidenceByService(input: {
    readonly service: string;
    readonly organizationId?: string;
  }): Promise<readonly ModelPerformanceRecord[]>;
  productionEvidenceByIndustry(input: {
    readonly industry: string;
    readonly organizationId?: string;
  }): Promise<readonly ModelPerformanceRecord[]>;
  productionEvidenceFingerprints(query?: PerformanceRecordQuery): Promise<readonly PerformanceFingerprint[]>;
  shadowDecisions(query?: ShadowDecisionQuery): Promise<readonly ShadowDecision[]>;
  shadowRecommendationFrequency(input?: {
    readonly service?: string;
    readonly sinceIso?: string;
  }): Promise<Readonly<Record<ShadowDecisionStatus, number>>>;
  strongestShadowRecommendations(limit?: number): Promise<readonly ShadowDecision[]>;
  insufficientEvidenceAreas(): Promise<readonly string[]>;
  confidenceDistribution(): Promise<Readonly<Record<string, number>>>;
  productionFailureCategories(query?: PerformanceRecordQuery): Promise<Readonly<Record<string, number>>>;
};

export function createProductionIntelligenceQueryService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly shadowStore?: IShadowDecisionStore;
}): ProductionIntelligenceQueryService {
  const recordStore = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const shadowStore = deps?.shadowStore ?? defaultShadowDecisionStore;

  async function productionRows(query?: PerformanceRecordQuery) {
    const rows = await recordStore.query({
      ...query,
      evidenceSource: "production",
      evidenceMode: "observational",
      limit: query?.limit ?? 10_000,
    });
    return filterObservationalProductionRecords(rows);
  }

  return Object.freeze({
    productionEvidence: productionRows,

    productionEvidenceByModel: async (input) =>
      productionRows({
        providerId: input.providerId,
        modelId: input.modelId,
        organizationId: input.organizationId,
      }),

    productionEvidenceByService: async (input) =>
      productionRows({ service: input.service, organizationId: input.organizationId }),

    productionEvidenceByIndustry: async (input) =>
      productionRows({ industry: input.industry, organizationId: input.organizationId }),

    productionEvidenceFingerprints: async (query) =>
      aggregateRecordsInMemory(await productionRows(query), 4),

    shadowDecisions: (query) => shadowStore.query(query ?? {}),

    shadowRecommendationFrequency: async (input) => {
      const rows = await shadowStore.query({
        service: input?.service,
        sinceIso: input?.sinceIso,
        limit: 10_000,
      });
      const counts: Record<ShadowDecisionStatus, number> = {
        SHADOW_RECOMMENDATION: 0,
        INSUFFICIENT_EVIDENCE: 0,
        INCOMPARABLE: 0,
        NO_BETTER_CANDIDATE: 0,
        CAPABILITY_MISMATCH: 0,
        OPERATIONAL_RISK: 0,
      };
      for (const row of rows) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
      }
      return Object.freeze(counts);
    },

    strongestShadowRecommendations: async (limit = 10) => {
      const rows = await shadowStore.query({ limit: 10_000 });
      return Object.freeze(
        [...rows]
          .filter((r) => r.status === "SHADOW_RECOMMENDATION")
          .sort((a, b) => (b.observedAdvantage ?? 0) - (a.observedAdvantage ?? 0))
          .slice(0, limit),
      );
    },

    insufficientEvidenceAreas: async () => {
      const rows = await shadowStore.query({ status: "INSUFFICIENT_EVIDENCE", limit: 10_000 });
      const scopes = new Set<string>();
      for (const row of rows) scopes.add(row.recommendationScope);
      return Object.freeze([...scopes]);
    },

    confidenceDistribution: async () => {
      const rows = await shadowStore.query({ limit: 10_000 });
      const dist: Record<string, number> = {};
      for (const row of rows) {
        dist[row.confidenceTier] = (dist[row.confidenceTier] ?? 0) + 1;
      }
      return Object.freeze(dist);
    },

    productionFailureCategories: async (query) => {
      const rows = await productionRows(query);
      const separated = separateEvidenceQuality(rows);
      const categories: Record<string, number> = {};
      for (const record of [...separated.operationalFailures, ...separated.other]) {
        for (const [key, count] of Object.entries(record.failureCategories)) {
          categories[key] = (categories[key] ?? 0) + count;
        }
        if (record.operationalFailureCategory) {
          categories[record.operationalFailureCategory] =
            (categories[record.operationalFailureCategory] ?? 0) + 1;
        }
      }
      return Object.freeze(categories);
    },
  });
}

export const defaultProductionIntelligenceQueryService =
  createProductionIntelligenceQueryService();
