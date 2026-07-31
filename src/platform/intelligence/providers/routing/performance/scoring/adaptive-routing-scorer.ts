/**
 * Adaptive routing scorer — wraps static DefaultRoutingScorer with performance feedback.
 */

import { success, type Result } from "../../../../shared/result";
import type { RoutingCandidate, RoutingScore } from "../../contracts/candidate";
import type { RoutingRequest } from "../../contracts/request";
import type { IRoutingScorer } from "../../interfaces/routing";
import type { AdaptiveRoutingConfig } from "../config/adaptive-routing-config";
import type { AdaptiveRoutingExplain } from "../contracts/performance-evidence";
import type { IModelPerformanceIntelligence } from "../interfaces/performance-intelligence";

export interface AdaptiveRoutingScore extends RoutingScore {
  readonly adaptiveExplain?: AdaptiveRoutingExplain;
}

export class AdaptiveRoutingScorer implements IRoutingScorer {
  constructor(
    private readonly base: IRoutingScorer,
    private readonly intelligence: IModelPerformanceIntelligence,
    private readonly config: AdaptiveRoutingConfig,
    private readonly random: () => number = Math.random
  ) {}

  score(candidate: RoutingCandidate, request: RoutingRequest): Result<RoutingScore> {
    // Synchronous interface — use scoreAll for adaptive blend (async).
    return this.base.score(candidate, request);
  }

  scoreAll(
    candidates: readonly RoutingCandidate[],
    request: RoutingRequest
  ): Result<readonly RoutingScore[]> {
    // Async blend happens in scoreAllAsync; sync path preserves static baseline.
    return this.base.scoreAll(candidates, request);
  }

  /**
   * Preferred entry when adaptive routing is enabled.
   */
  async scoreAllAsync(
    candidates: readonly RoutingCandidate[],
    request: RoutingRequest
  ): Promise<Result<readonly AdaptiveRoutingScore[]>> {
    const base = this.base.scoreAll(candidates, request);
    if (!base.ok) return base;
    if (!this.config.adaptiveRoutingEnabled) {
      return success(
        base.value.map((s) => ({
          ...s,
          adaptiveExplain: {
            staticScore: s.total,
            performanceScore: 0.5,
            qualityScore: s.dimensions.quality,
            latencyScore: s.dimensions.latency,
            costScore: s.dimensions.cost,
            healthAdjustment: 0,
            policyAdjustment: 0,
            finalScore: s.total,
            sampleCount: 0,
            usedAdaptiveFeedback: false,
            coldStart: true,
          },
        }))
      );
    }

    const orgId =
      request.preferences?.tenantId !== undefined
        ? String(request.preferences.tenantId)
        : typeof request.metadata?.organizationId === "string"
          ? request.metadata.organizationId
          : undefined;

    const blended: AdaptiveRoutingScore[] = [];
    for (const s of base.value) {
      const out = await this.intelligence.blendScore({
        staticTotal: s.total,
        staticQuality: s.dimensions.quality,
        staticLatency: s.dimensions.latency,
        staticCost: s.dimensions.cost,
        staticHealth: s.dimensions.health,
        strategy: request.strategy,
        key: {
          providerId: String(s.providerId),
          modelId: s.modelId ? String(s.modelId) : "unknown",
          capabilityId: String(request.capabilityId),
          organizationId: orgId,
        },
      });
      blended.push({
        ...s,
        total: out.total,
        dimensions: {
          ...s.dimensions,
          quality: out.quality,
          latency: out.latency,
          cost: out.cost,
        },
        adaptiveExplain: out.explain,
      });
    }

    // Conservative exploration: occasionally promote a non-top executable candidate.
    if (
      this.config.explorationRate > 0 &&
      blended.length > 1 &&
      this.random() < this.config.explorationRate
    ) {
      const healthy = blended.filter((s) => {
        const c = candidates.find(
          (x) =>
            String(x.providerId) === String(s.providerId) &&
            String(x.modelId ?? "") === String(s.modelId ?? "")
        );
        return c?.healthy !== false && (c?.healthState ?? "healthy") !== "unhealthy";
      });
      if (healthy.length > 1) {
        const idx = 1 + Math.floor(this.random() * (healthy.length - 1));
        const pick = healthy[idx];
        const boosted = {
          ...pick,
          total: Math.min(1, pick.total + 0.001),
          adaptiveExplain: pick.adaptiveExplain
            ? { ...pick.adaptiveExplain, exploratory: true }
            : undefined,
        };
        return success(
          blended.map((s) =>
            String(s.providerId) === String(boosted.providerId) &&
            String(s.modelId ?? "") === String(boosted.modelId ?? "")
              ? boosted
              : s
          )
        );
      }
    }

    return success(blended);
  }
}
