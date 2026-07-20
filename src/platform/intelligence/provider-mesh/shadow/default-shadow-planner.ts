/**
 * Shadow planner — background comparison recommendations, no execution.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { ShadowRecommendation } from "../contracts/recommendations";
import type { IShadowPlanner } from "../interfaces/mesh";

export class DefaultShadowPlanner implements IShadowPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly ShadowRecommendation[]> {
    const ranked = [...records].sort(
      (a, b) => b.compositeScore.overall - a.compositeScore.overall
    );
    if (ranked.length < 2) return success([]);

    const primary = ranked[0]!;
    const recommendations: ShadowRecommendation[] = [];

    for (const candidate of ranked.slice(1)) {
      if (
        candidate.state === "unavailable" ||
        candidate.state === "maintenance" ||
        candidate.state === "deprecated"
      ) {
        recommendations.push({
          recommendationId: `shadow_hold_${primary.providerId}_${candidate.providerId}`,
          primaryProviderId: primary.providerId,
          shadowProviderId: candidate.providerId,
          action: "hold",
          comparisonMetadata: {
            reason: "shadow_ineligible",
            candidateState: candidate.state,
            execution: false,
          },
          rationale: {
            why: `Do not shadow ${candidate.providerId} while in state ${candidate.state}.`,
            metrics: [`overall=${candidate.compositeScore.overall.toFixed(3)}`],
            evidence: [candidate.explanation],
            confidence: 0.8,
          },
        });
        continue;
      }

      const latencyDelta =
        candidate.telemetry.averageLatencyMs - primary.telemetry.averageLatencyMs;
      const qualityDelta =
        candidate.compositeScore.quality - primary.compositeScore.quality;

      recommendations.push({
        recommendationId: `shadow_${primary.providerId}_${candidate.providerId}`,
        primaryProviderId: primary.providerId,
        shadowProviderId: candidate.providerId,
        action: candidate.state === "experimental" ? "recommend" : "compare",
        comparisonMetadata: {
          latencyDeltaMs: latencyDelta,
          qualityDelta,
          primaryScore: primary.compositeScore.overall,
          shadowScore: candidate.compositeScore.overall,
          execution: false,
        },
        rationale: {
          why: `Recommend background shadow of ${candidate.providerId} against primary ${primary.providerId} for offline comparison only.`,
          metrics: [
            `latencyDeltaMs=${latencyDelta.toFixed(1)}`,
            `qualityDelta=${qualityDelta.toFixed(3)}`,
            `shadowOverall=${candidate.compositeScore.overall.toFixed(3)}`,
          ],
          evidence: [primary.explanation, candidate.explanation],
          confidence: clamp01(0.5 + candidate.compositeScore.overall * 0.35),
        },
      });
    }

    return success(recommendations);
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
