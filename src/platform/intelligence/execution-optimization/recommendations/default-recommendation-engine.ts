/**
 * Recommendation prioritization engine.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { IRecommendationEngine } from "../interfaces/execution-optimization";

const PRIORITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 } as const;

export class DefaultRecommendationEngine implements IRecommendationEngine {
  prioritize(
    recommendations: readonly OptimizationRecommendation[],
    maxCount = 20
  ): Result<readonly OptimizationRecommendation[]> {
    const sorted = [...recommendations].sort((a, b) => {
      const p =
        PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (p !== 0) return p;
      return b.expectedImpact * b.confidence - a.expectedImpact * a.confidence;
    });

    return success(sorted.slice(0, maxCount));
  }
}
