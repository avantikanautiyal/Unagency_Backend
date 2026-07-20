/**
 * Simulation contracts.
 */

import type { PipelineStageKind } from "./enums";
import type { PlanningState } from "./context";

export interface PipelineSimulationReport {
  readonly reportId: string;
  readonly mode: "dry_run";
  readonly stagesSimulated: readonly PipelineStageKind[];
  readonly planningState: PlanningState;
  readonly estimatedDurationMs: number;
  readonly providerExecution: false;
  readonly rationale: string;
}
