/**
 * Ranks recommendations by confidence — does not apply them.
 */

import type { LearningRecommendation } from "../contracts/learning-models";
import type { IRankingStrategy } from "../interfaces/learning-ports";

export class ConfidenceRankingStrategy implements IRankingStrategy {
  rank(
    recommendations: readonly LearningRecommendation[]
  ): readonly LearningRecommendation[] {
    return [...recommendations].sort((a, b) => b.confidence - a.confidence);
  }
}
