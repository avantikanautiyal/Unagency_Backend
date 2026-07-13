/**
 * Simulation contracts.
 */

import type { SimulationOutcome } from "./enums";

export interface OptimizationSimulation {
  readonly simulationId: string;
  readonly recommendationId: string;
  readonly outcome: SimulationOutcome;
  readonly projectedQualityDelta: number;
  readonly projectedCostDelta: number;
  readonly projectedLatencyDelta: number;
  readonly confidence: number;
  readonly rationale: string;
  readonly simulatedAt: string;
}
