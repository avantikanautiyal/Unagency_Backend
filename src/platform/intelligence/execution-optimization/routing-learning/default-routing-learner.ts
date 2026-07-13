/**
 * Routing learner — advisory preference hints only (no routing execution).
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IRoutingLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultRoutingLearner implements IRoutingLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const recs: OptimizationRecommendation[] = [];
    const latencyPattern = patterns.find((p) => p.id === "pat_latency_high");
    const reports = request.inputs.observabilityReports ?? [];

    if (latencyPattern && reports.length > 1) {
      const sorted = [...reports].sort((a, b) => a.latencyMs - b.latencyMs);
      const best = sorted[0];
      recs.push(
        makeRecommendation(
          "rec_routing_latency",
          "provider_selection",
          "Routing hint: prefer low-latency provider",
          `Provider ${best.providerId} had lowest observed latency`,
          "Future routing decisions may weight latency higher (advisory only)",
          0.1,
          0.66,
          now
        )
      );
    }

    const learning = request.inputs.learningResults ?? [];
    const routingSignals = learning.flatMap((lr) =>
      lr.signals.filter((s) => s.kind === "routing")
    );
    if (routingSignals.length > 0) {
      recs.push(
        makeRecommendation(
          "rec_routing_learning",
          "provider_selection",
          "Review routing learning signals",
          `${routingSignals.length} routing signals from learning platform`,
          "Incorporate learning signals into future routing policy review",
          0.08,
          0.6,
          now
        )
      );
    }

    return success(recs);
  }
}
