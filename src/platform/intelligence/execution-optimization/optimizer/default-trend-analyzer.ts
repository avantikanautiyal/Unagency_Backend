/**
 * Trend analyzer — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionTrend } from "../contracts/patterns";
import type { ExecutionOptimizationInputs } from "../contracts/inputs";
import type { ITrendAnalyzer } from "../interfaces/execution-optimization";
import { avgMetric } from "../heuristics/learner-helpers";

export class DefaultTrendAnalyzer implements ITrendAnalyzer {
  analyze(inputs: ExecutionOptimizationInputs): Result<readonly ExecutionTrend[]> {
    const trends: ExecutionTrend[] = [];
    const evalScores =
      inputs.evaluationReports?.map((e) => e.summary.overallScore) ?? [];
    if (evalScores.length >= 2) {
      const first = avgMetric(evalScores.slice(0, Math.ceil(evalScores.length / 2)));
      const second = avgMetric(evalScores.slice(Math.ceil(evalScores.length / 2)));
      trends.push({
        metric: "evaluation_score",
        direction:
          second > first + 0.02
            ? "improving"
            : second < first - 0.02
              ? "declining"
              : "stable",
        values: evalScores,
        period: "historical",
      });
    }

    const latencies = inputs.observabilityReports?.map((r) => r.latencyMs) ?? [];
    if (latencies.length >= 2) {
      const first = avgMetric(latencies.slice(0, Math.ceil(latencies.length / 2)));
      const second = avgMetric(latencies.slice(Math.ceil(latencies.length / 2)));
      trends.push({
        metric: "latency_ms",
        direction:
          second < first - 50
            ? "improving"
            : second > first + 50
              ? "declining"
              : "stable",
        values: latencies,
        period: "historical",
      });
    }

    return success(trends);
  }
}
