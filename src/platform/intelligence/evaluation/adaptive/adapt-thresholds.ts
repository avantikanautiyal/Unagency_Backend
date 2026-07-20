/**
 * Adaptive helpers — adjust thresholds using historical scores (advisory).
 */

import type { BenchmarkProfile, DynamicEvaluationStrategy } from "../contracts/dynamic-evaluation";

export function adaptPassingScore(
  strategy: DynamicEvaluationStrategy,
  benchmark: BenchmarkProfile
): number {
  let score = benchmark.targetScore;
  if (strategy.historicalSuccessRate !== undefined) {
    score = Math.max(score, strategy.historicalSuccessRate * 0.95);
  }
  if (strategy.riskLevel === "critical") score = Math.max(score, 0.9);
  return Math.min(0.95, score);
}
