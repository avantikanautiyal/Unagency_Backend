/**
 * Confidence engine — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationConfidence } from "../contracts/scoring";
import type { OptimizationScore } from "../contracts/scoring";
import type { ConfidenceLevel } from "../contracts/enums";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IConfidenceEngine } from "../interfaces/execution-optimization";
import { avgMetric } from "../heuristics/learner-helpers";

function levelFor(score: number): ConfidenceLevel {
  if (score >= 0.85) return "very_high";
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export class DefaultConfidenceEngine implements IConfidenceEngine {
  compute(
    _request: ExecutionOptimizationRequest,
    scores: readonly OptimizationScore[],
    sampleSize: number
  ): Result<OptimizationConfidence> {
    const avgImprovement = avgMetric(scores.map((s) => s.improvement), 0);
    const sampleFactor = Math.min(1, sampleSize / 10);
    const score = Math.min(0.95, avgImprovement * 2 * sampleFactor + 0.3);

    return success({
      level: levelFor(score),
      score,
      factors: [
        `sample size: ${sampleSize}`,
        `domains scored: ${scores.length}`,
        `avg improvement: ${avgImprovement.toFixed(3)}`,
      ],
      sampleSize,
      rationale: "Heuristic confidence from sample size and score distribution",
    });
  }
}
