/**
 * Feedback analyzer — placeholder heuristic.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationInputs } from "../contracts/inputs";
import type { IFeedbackAnalyzer } from "../interfaces/execution-optimization";
import { avgMetric, patternFor } from "../heuristics/learner-helpers";

export class DefaultFeedbackAnalyzer implements IFeedbackAnalyzer {
  analyze(inputs: ExecutionOptimizationInputs): Result<readonly ExecutionPattern[]> {
    const now = new Date().toISOString();
    const patterns: ExecutionPattern[] = [];

    const evalScores =
      inputs.evaluationReports?.map((r) => r.summary.overallScore) ?? [];
    if (evalScores.length > 0) {
      const avg = avgMetric(evalScores);
      if (avg < 0.7) {
        patterns.push(
          patternFor(
            "pat_quality_low",
            "execution_strategy",
            "Historical evaluation scores below threshold",
            evalScores.length,
            0.7 - avg,
            now
          )
        );
      }
    }

    const latencies =
      inputs.observabilityReports?.map((r) => r.latencyMs) ?? [];
    if (latencies.length > 0) {
      const avg = avgMetric(latencies);
      if (avg > 2000) {
        patterns.push(
          patternFor(
            "pat_latency_high",
            "latency_vs_quality",
            "Observed latency above 2000ms average",
            latencies.length,
            avg / 5000,
            now
          )
        );
      }
    }

    const costs = inputs.observabilityReports?.map((r) => r.cost) ?? [];
    if (costs.length > 0) {
      const avg = avgMetric(costs);
      patterns.push(
        patternFor(
          "pat_cost_trend",
          "cost_vs_quality",
          `Average cost ${avg.toFixed(4)} observed`,
          costs.length,
          0.3,
          now
        )
      );
    }

    const signalCount =
      inputs.learningResults?.reduce((s, lr) => s + lr.signals.length, 0) ?? 0;
    if (signalCount > 0) {
      patterns.push(
        patternFor(
          "pat_learning_signals",
          "execution_strategy",
          `${signalCount} learning signals available for analysis`,
          signalCount,
          0.4,
          now
        )
      );
    }

    return success(patterns);
  }
}
