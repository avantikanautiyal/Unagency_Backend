/**
 * Read-only performance intelligence — evidence queries only.
 * blendScore returns static scores unchanged (no adaptive routing).
 */

import type { IModelPerformanceIntelligence, PerformanceLookupKey } from "./interfaces/performance-intelligence";
import type { ModelPerformanceMetrics, PerformanceScope } from "./contracts/performance-metrics";
import type { RoutingStrategyKind } from "../contracts/enums";
import type { AdaptiveRoutingExplain } from "./contracts/performance-evidence";
import type { IBenchmarkPerformanceRecordStore } from "./benchmark/persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "./benchmark/persistence/benchmark-record-store";
import { aggregateRecordsInMemory } from "./benchmark/intelligence/performance-aggregator";

export class EvidenceOnlyPerformanceIntelligence implements IModelPerformanceIntelligence {
  constructor(
    private readonly recordStore: IBenchmarkPerformanceRecordStore = defaultBenchmarkPerformanceRecordStore,
  ) {}

  async metricsFor(
    key: PerformanceLookupKey,
    scope?: PerformanceScope,
  ): Promise<ModelPerformanceMetrics | undefined> {
    const query: Parameters<IBenchmarkPerformanceRecordStore["query"]>[0] = {
      providerId: key.providerId,
      modelId: key.modelId,
      organizationId: key.organizationId,
      limit: 10_000,
    };

    if (scope?.kind === "capability") {
      // capabilityId not on benchmark records directly — filter post-query
    }

    const records = await this.recordStore.query(query);
    const filtered =
      scope?.kind === "capability"
        ? records.filter((r) => r.capabilityId === scope.capabilityId)
        : records;

    if (filtered.length === 0) return undefined;

    const fp = aggregateRecordsInMemory(filtered, 1)[0];
    if (!fp) return undefined;

    const successRate = fp.successfulSamples / fp.sampleCount;
    const timestamps = filtered.map((r) => r.recordedAt).sort();

    return Object.freeze({
      providerId: key.providerId,
      modelId: key.modelId,
      capabilityId: key.capabilityId,
      organizationId: key.organizationId,
      successRate,
      evaluationMean: fp.qualityScoreMean,
      latencyP50: fp.latencyMsMean,
      failureRate: 1 - successRate,
      timeoutRate:
        (filtered.filter((r) => r.operationalFailureCategory === "timeout").length /
          filtered.length),
      rateLimitRate:
        (filtered.filter((r) => r.operationalFailureCategory === "rate_limit").length /
          filtered.length),
      averageCost: fp.costMean,
      sampleCount: fp.sampleCount,
      recentSampleCount: fp.sampleCount,
      windowStart: timestamps[0] ?? fp.windowStart,
      windowEnd: timestamps[timestamps.length - 1] ?? fp.windowEnd,
    });
  }

  /**
   * Step 3: NO adaptive routing — static scores returned unchanged.
   */
  async blendScore(input: {
    staticTotal: number;
    staticQuality: number;
    staticLatency: number;
    staticCost: number;
    staticHealth: number;
    strategy: RoutingStrategyKind;
    key: PerformanceLookupKey;
  }): Promise<{
    total: number;
    quality: number;
    latency: number;
    cost: number;
    explain: AdaptiveRoutingExplain;
  }> {
    return Object.freeze({
      total: input.staticTotal,
      quality: input.staticQuality,
      latency: input.staticLatency,
      cost: input.staticCost,
      explain: Object.freeze({
        staticScore: input.staticTotal,
        performanceScore: input.staticTotal,
        qualityScore: input.staticQuality,
        latencyScore: input.staticLatency,
        costScore: input.staticCost,
        healthAdjustment: input.staticHealth,
        policyAdjustment: 0,
        finalScore: input.staticTotal,
        sampleCount: 0,
        usedAdaptiveFeedback: false,
        coldStart: true,
      }),
    });
  }
}

export const defaultEvidenceOnlyPerformanceIntelligence =
  new EvidenceOnlyPerformanceIntelligence();
