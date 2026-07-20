/**
 * Capability recommendations with explainability.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityRecommendations, CapabilityScorecard } from "../contracts/scoring";
import type { IRecommendationBuilder } from "../interfaces/capability-intelligence";

export class DefaultRecommendationBuilder implements IRecommendationBuilder {
  build(
    selected: readonly CapabilityDefinitionRecord[],
    candidates: readonly CapabilityDefinitionRecord[],
    scorecards: readonly CapabilityScorecard[]
  ): Result<CapabilityRecommendations> {
    const scoreById = new Map(scorecards.map((s) => [s.capabilityId, s]));
    const selectedIds = new Set(selected.map((s) => s.capabilityId));

    const primary = selected
      .map((cap, idx) => {
        const card = scoreById.get(cap.capabilityId);
        const score = card?.scores.overall ?? 0.5;
        const alternatives = candidates
          .filter(
            (c) =>
              !selectedIds.has(c.capabilityId) &&
              c.department === cap.department &&
              c.category === cap.category
          )
          .slice(0, 3)
          .map((c) => c.capabilityId);

        return {
          recommendationId: `rec_${cap.capabilityId}`,
          capabilityId: cap.capabilityId,
          rank: idx + 1,
          score,
          evidence: {
            whySelected: `Selected ${cap.capabilityId} to advance the business objective within ${cap.department}/${cap.category}.`,
            dependencies: [...cap.dependencies],
            alternatives,
            tradeOffs: [
              `cost=${cap.costTier}`,
              `latency=${cap.latencyTier}`,
              `complexity=${cap.complexity}`,
              `maturity=${cap.maturity}`,
            ],
            historicalSuccess: card
              ? `Composite score ${score.toFixed(3)}; reliability dimension ${card.scores.reliability.toFixed(3)}.`
              : "No historical evolution metrics; using maturity defaults.",
            confidence: clamp01(0.45 + score * 0.5),
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const alternatives = candidates
      .filter((c) => !selectedIds.has(c.capabilityId))
      .slice(0, 5)
      .map((cap, idx) => {
        const card = scoreById.get(cap.capabilityId);
        const score = card?.scores.overall ?? 0.4;
        return {
          recommendationId: `alt_${cap.capabilityId}`,
          capabilityId: cap.capabilityId,
          rank: idx + 1,
          score,
          evidence: {
            whySelected: `Alternative ${cap.capabilityId} not in primary bundle but remaining catalog match.`,
            dependencies: [...cap.dependencies],
            alternatives: [],
            tradeOffs: [`maturity=${cap.maturity}`, `cost=${cap.costTier}`],
            historicalSuccess: card
              ? `Score ${score.toFixed(3)}.`
              : "Insufficient history.",
            confidence: clamp01(0.35 + score * 0.4),
          },
        };
      });

    return success({ primary, alternatives });
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
