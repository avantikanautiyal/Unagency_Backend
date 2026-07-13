/**
 * Heuristic learner — proposes updates, never mutates.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationHeuristic } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IHeuristicLearner } from "../interfaces/execution-optimization";

export class DefaultHeuristicLearner implements IHeuristicLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationHeuristic[]> {
    const proposals: OptimizationHeuristic[] = [];
    const intel = request.inputs.intelligenceResults ?? [];

    if (patterns.some((p) => p.id === "pat_quality_low")) {
      proposals.push({
        id: "heur_complexity_weight",
        domain: "execution_strategy",
        name: "complexity_weight",
        currentValue: 0.25,
        proposedValue: 0.35,
        delta: 0.1,
        rationale: "Increase complexity weight to favor multi-pass strategies",
        advisoryOnly: true,
      });
    }

    if (patterns.some((p) => p.id === "pat_latency_high")) {
      proposals.push({
        id: "heur_latency_bias",
        domain: "latency_vs_quality",
        name: "latency_bias",
        currentValue: 0.6,
        proposedValue: 0.8,
        delta: 0.2,
        rationale: "Increase latency bias in strategy selection",
        advisoryOnly: true,
      });
    }

    const avgCompression =
      intel.length > 0
        ? intel.reduce((s, r) => s + r.budget.compressionRatio, 0) / intel.length
        : 1;
    if (avgCompression < 0.9) {
      proposals.push({
        id: "heur_compression_threshold",
        domain: "compression",
        name: "compression_threshold",
        currentValue: 0.9,
        proposedValue: 0.85,
        delta: -0.05,
        rationale: "Trigger compression earlier based on historical overflow",
        advisoryOnly: true,
      });
    }

    return success(proposals);
  }
}
