/**
 * Simulation engine — estimates impact without executing providers.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationSimulation } from "../contracts/simulation";
import type { SimulationOutcome } from "../contracts/enums";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { ISimulationEngine } from "../interfaces/execution-optimization";

function outcomeFor(impact: number): SimulationOutcome {
  if (impact > 0.1) return "positive";
  if (impact < 0.03) return "negative";
  return "neutral";
}

export class DefaultSimulationEngine implements ISimulationEngine {
  simulate(
    _request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationSimulation[]> {
    const now = new Date().toISOString();

    return success(
      recommendations.map((rec) => {
        const qualityDelta = rec.expectedImpact;
        const costDelta = rec.domain === "cost_vs_quality" ? -0.05 : 0.02;
        const latencyDelta =
          rec.domain === "latency_vs_quality" ? -0.08 : 0.01;

        return {
          simulationId: `sim_${rec.id}`,
          recommendationId: rec.id,
          outcome: outcomeFor(qualityDelta),
          projectedQualityDelta: qualityDelta,
          projectedCostDelta: costDelta,
          projectedLatencyDelta: latencyDelta,
          confidence: rec.confidence * 0.9,
          rationale: `Simulated impact of: ${rec.title}`,
          simulatedAt: now,
        };
      })
    );
  }
}
