/**
 * Canary planner — percentage rollout recommendations only.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { CanaryPlan } from "../contracts/recommendations";
import type { ICanaryPlanner } from "../interfaces/mesh";

export class DefaultCanaryPlanner implements ICanaryPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly CanaryPlan[]> {
    const healthy = records.filter((r) => r.state === "healthy" || r.state === "busy");
    const experimental = records.filter(
      (r) => r.state === "experimental" || r.certificationStatus === "experimental"
    );
    const degraded = records.filter(
      (r) => r.state === "degraded" || r.state === "rate_limited"
    );

    const plans: CanaryPlan[] = [];
    let i = 0;

    for (const target of experimental) {
      const source =
        healthy.sort((a, b) => b.compositeScore.overall - a.compositeScore.overall)[0] ??
        records
          .filter((r) => r.providerId !== target.providerId)
          .sort((a, b) => b.compositeScore.overall - a.compositeScore.overall)[0];
      if (!source) continue;

      const scoreGap = source.compositeScore.overall - target.compositeScore.overall;
      const rollback = target.telemetry.errorRate > 0.2 || scoreGap > 0.25;
      const percentage = rollback ? 0 : target.compositeScore.overall >= 0.6 ? 10 : 5;

      plans.push({
        planId: `canary_${++i}_${source.providerId}_${target.providerId}`,
        sourceProviderId: source.providerId,
        targetProviderId: target.providerId,
        percentage,
        action: rollback ? "rollback" : percentage > 0 ? "start" : "hold",
        rollbackRecommended: rollback,
        rationale: {
          why: rollback
            ? `Recommend rollback / hold canary to ${target.providerId} due to weak operational signals.`
            : `Recommend ${percentage}% canary from ${source.providerId} to ${target.providerId}.`,
          metrics: [
            `sourceOverall=${source.compositeScore.overall.toFixed(3)}`,
            `targetOverall=${target.compositeScore.overall.toFixed(3)}`,
            `targetErrorRate=${target.telemetry.errorRate.toFixed(3)}`,
          ],
          evidence: [source.explanation, target.explanation],
          confidence: clamp01(0.55 + Math.min(source.compositeScore.overall, 0.4)),
        },
      });
    }

    for (const weak of degraded) {
      const stronger = healthy
        .filter((h) => h.providerId !== weak.providerId)
        .sort((a, b) => b.compositeScore.overall - a.compositeScore.overall)[0];
      if (!stronger) continue;

      plans.push({
        planId: `canary_${++i}_rollback_${weak.providerId}`,
        sourceProviderId: stronger.providerId,
        targetProviderId: weak.providerId,
        percentage: 0,
        action: "rollback",
        rollbackRecommended: true,
        rationale: {
          why: `Rollback canary traffic away from degraded provider ${weak.providerId}.`,
          metrics: [
            `weakOverall=${weak.compositeScore.overall.toFixed(3)}`,
            `strongOverall=${stronger.compositeScore.overall.toFixed(3)}`,
          ],
          evidence: [weak.explanation, stronger.explanation],
          confidence: 0.75,
        },
      });
    }

    return success(plans);
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
