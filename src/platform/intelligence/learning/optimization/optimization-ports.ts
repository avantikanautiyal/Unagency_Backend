/**
 * Optimization ports — interfaces only. No automatic optimization (M3.3).
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { LearningRecommendation } from "../contracts/learning-models";
import type { IOptimizationEngine } from "../interfaces/learning-ports";

export class PlaceholderOptimizationEngine implements IOptimizationEngine {
  readonly supported = false;

  suggest(
    recommendations: readonly LearningRecommendation[]
  ): Result<readonly LearningRecommendation[]> {
    return success(recommendations);
  }
}
