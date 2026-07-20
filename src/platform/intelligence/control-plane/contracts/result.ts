/**
 * Control Plane result contracts.
 */

import type { ControlPlaneResultId } from "./identifiers";
import type { ControlPlaneRequest } from "./request";
import type { ExecutionReadyPlan } from "./plan";
import type { PipelineContext, PlanningState } from "./context";
import type { PipelineDiagnostics } from "./diagnostics";
import type { PipelineSimulationReport } from "./simulation";
import type { UnifiedExplanation } from "./explainability";
import type { ArtifactChain } from "./artifacts";

export interface ControlPlaneStatistics {
  readonly stagesExecuted: number;
  readonly totalDurationMs: number;
  readonly authorized: boolean;
}

export interface ControlPlaneReport {
  readonly resultId: ControlPlaneResultId;
  readonly request: ControlPlaneRequest;
  readonly executionReadyPlan: ExecutionReadyPlan;
  readonly context: PipelineContext;
  readonly planningState: PlanningState;
  readonly diagnostics: PipelineDiagnostics;
  readonly simulation?: PipelineSimulationReport;
  readonly explanation: UnifiedExplanation;
  readonly artifacts: ArtifactChain;
  readonly statistics: ControlPlaneStatistics;
  readonly createdAt: string;
}
