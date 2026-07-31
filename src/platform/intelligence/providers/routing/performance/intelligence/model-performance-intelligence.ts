/**
 * Model/Provider Performance Intelligence — blends historical evidence into routing scores.
 */

import type { AdaptiveRoutingConfig } from "../config/adaptive-routing-config";
import type { AdaptiveRoutingExplain } from "../contracts/performance-evidence";
import type { ModelPerformanceMetrics } from "../contracts/performance-metrics";
import type { IModelPerformanceStore } from "../interfaces/model-performance-store";
import type {
  IModelPerformanceIntelligence,
  PerformanceLookupKey,
} from "../interfaces/performance-intelligence";
import {
  aggregatePerformanceEvidence,
  recencyWeightedSuccessRate,
} from "../aggregation/performance-aggregator";
import type { RoutingStrategyKind } from "../../contracts/enums";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function strategyWeights(strategy: RoutingStrategyKind): {
  quality: number;
  latency: number;
  cost: number;
  reliability: number;
} {
  switch (strategy) {
    case "highest_quality":
      return { quality: 0.55, latency: 0.15, cost: 0.1, reliability: 0.2 };
    case "lowest_latency":
      return { quality: 0.15, latency: 0.55, cost: 0.1, reliability: 0.2 };
    case "lowest_cost":
      return { quality: 0.15, latency: 0.15, cost: 0.5, reliability: 0.2 };
    case "health_first":
      return { quality: 0.15, latency: 0.2, cost: 0.1, reliability: 0.55 };
    case "balanced":
    default:
      return { quality: 0.3, latency: 0.25, cost: 0.2, reliability: 0.25 };
  }
}

export class ModelPerformanceIntelligence implements IModelPerformanceIntelligence {
  constructor(
    private readonly store: IModelPerformanceStore,
    private readonly config: AdaptiveRoutingConfig,
    private readonly nowMs: () => number = () => Date.now()
  ) {}

  async metricsFor(
    key: PerformanceLookupKey
  ): Promise<ModelPerformanceMetrics | undefined> {
    const sinceIso = new Date(
      this.nowMs() - this.config.windowDays * 86_400_000
    ).toISOString();

    // Tenant overlay: when org-scoped samples meet threshold, use them exclusively
    // (do not blend other tenants' raw evidence into this decision).
    if (key.organizationId && this.config.tenantOverlayEnabled) {
      const tenantRows = await this.store.query({
        organizationId: key.organizationId,
        providerId: key.providerId,
        modelId: key.modelId,
        capabilityId: key.capabilityId,
        sinceIso,
        limit: 2000,
      });
      const tenantMetrics = aggregatePerformanceEvidence(
        tenantRows,
        {
          providerId: key.providerId,
          modelId: key.modelId,
          capabilityId: key.capabilityId,
          organizationId: key.organizationId,
        },
        { windowDays: this.config.windowDays, nowMs: this.nowMs }
      );
      if (tenantMetrics && tenantMetrics.sampleCount >= this.config.minSamples) {
        return tenantMetrics;
      }
      // Insufficient tenant samples → cold-start (static), not foreign tenant evidence.
      return undefined;
    }

    const globalRows = await this.store.query({
      globalOnly: true,
      providerId: key.providerId,
      modelId: key.modelId,
      capabilityId: key.capabilityId,
      sinceIso,
      limit: 5000,
    });

    return aggregatePerformanceEvidence(
      globalRows,
      {
        providerId: key.providerId,
        modelId: key.modelId,
        capabilityId: key.capabilityId,
      },
      { windowDays: this.config.windowDays, nowMs: this.nowMs }
    );
  }

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
    const cold: AdaptiveRoutingExplain = {
      staticScore: input.staticTotal,
      performanceScore: 0.5,
      qualityScore: input.staticQuality,
      latencyScore: input.staticLatency,
      costScore: input.staticCost,
      healthAdjustment: 0,
      policyAdjustment: 0,
      finalScore: input.staticTotal,
      sampleCount: 0,
      usedAdaptiveFeedback: false,
      coldStart: true,
    };

    if (!this.config.adaptiveRoutingEnabled) {
      return {
        total: input.staticTotal,
        quality: input.staticQuality,
        latency: input.staticLatency,
        cost: input.staticCost,
        explain: cold,
      };
    }

    const metrics = await this.metricsFor(input.key);
    if (!metrics || metrics.sampleCount < this.config.minSamples) {
      return {
        total: input.staticTotal,
        quality: input.staticQuality,
        latency: input.staticLatency,
        cost: input.staticCost,
        explain: { ...cold, sampleCount: metrics?.sampleCount ?? 0 },
      };
    }

    const sinceIso = new Date(
      this.nowMs() - this.config.windowDays * 86_400_000
    ).toISOString();
    const rows = input.key.organizationId
      ? await this.store.query({
          organizationId: input.key.organizationId,
          providerId: input.key.providerId,
          modelId: input.key.modelId,
          capabilityId: input.key.capabilityId,
          sinceIso,
          limit: 2000,
        })
      : await this.store.query({
          globalOnly: true,
          providerId: input.key.providerId,
          modelId: input.key.modelId,
          capabilityId: input.key.capabilityId,
          sinceIso,
          limit: 5000,
        });

    const reliability =
      recencyWeightedSuccessRate(rows, {
        windowDays: this.config.windowDays,
        nowMs: this.nowMs,
      }) ?? metrics.successRate;

    const qualityFromEval =
      metrics.evaluationMean !== undefined
        ? clamp01(metrics.evaluationMean)
        : input.staticQuality;

    const latencyFromEvidence =
      metrics.latencyP50 !== undefined
        ? clamp01(1 - metrics.latencyP50 / 10_000)
        : input.staticLatency;

    const costFromEvidence =
      metrics.averageCost != null
        ? clamp01(1 - metrics.averageCost / 100)
        : input.staticCost;

    const weights = strategyWeights(input.strategy);
    const performanceScore = clamp01(
      qualityFromEval * weights.quality +
        latencyFromEvidence * weights.latency +
        costFromEvidence * weights.cost +
        reliability * weights.reliability
    );

    // Recent failure pressure — bounded health adjustment.
    const recentFailurePressure = clamp01(metrics.failureRate * (metrics.recentSampleCount > 0 ? 1 : 0.5));
    const healthAdjustment = -0.15 * recentFailurePressure;

    const contrib = Math.min(
      this.config.maxPerformanceContribution,
      this.config.feedbackWeight
    );
    const blended =
      input.staticTotal * (1 - contrib) + performanceScore * contrib + healthAdjustment;
    const finalScore = clamp01(
      Math.max(this.config.staticScoreFloor, blended)
    );

    // Soft-adjust quality/latency/cost dims for strategy rankers.
    const quality = clamp01(
      input.staticQuality * (1 - contrib) + qualityFromEval * contrib
    );
    const latency = clamp01(
      input.staticLatency * (1 - contrib) + latencyFromEvidence * contrib
    );
    const cost = clamp01(
      input.staticCost * (1 - contrib) + costFromEvidence * contrib
    );

    const explain: AdaptiveRoutingExplain = {
      staticScore: input.staticTotal,
      performanceScore,
      qualityScore: quality,
      latencyScore: latency,
      costScore: cost,
      healthAdjustment,
      policyAdjustment: 0,
      finalScore,
      sampleCount: metrics.sampleCount,
      usedAdaptiveFeedback: true,
      coldStart: false,
    };

    return { total: finalScore, quality, latency, cost, explain };
  }
}
