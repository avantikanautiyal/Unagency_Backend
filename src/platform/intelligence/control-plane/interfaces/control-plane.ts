/**
 * Intelligence Control Plane public interfaces.
 */

import type { Result } from "../../shared/result";
import type { ControlPlaneRequest } from "../contracts/request";
import type { ControlPlaneReport, ControlPlaneStatistics } from "../contracts/result";
import type { ExecutionReadyPlan } from "../contracts/plan";
import type { UnifiedExplanation } from "../contracts/explainability";
import type { PipelineSimulationReport } from "../contracts/simulation";
import type { PipelineDiagnostics } from "../contracts/diagnostics";
import type { ArtifactChain } from "../contracts/artifacts";

export interface IIntelligenceControlPlaneEngine {
  plan(request: ControlPlaneRequest): Promise<Result<ControlPlaneReport>>;
  simulate(request: ControlPlaneRequest): Promise<Result<PipelineSimulationReport>>;
  explain(request: ControlPlaneRequest): Promise<Result<UnifiedExplanation>>;
}

export interface IPipelineOrchestrator {
  execute(request: ControlPlaneRequest): Promise<Result<PipelineOrchestratorResult>>;
}

export interface IPipelineValidator {
  validate(chain: ArtifactChain): Result<PipelineDiagnostics>;
}

export interface IPipelineSimulator {
  simulate(request: ControlPlaneRequest, stats: ControlPlaneStatistics): Result<PipelineSimulationReport>;
}

export interface PipelineOrchestratorResult {
  readonly executionReadyPlan: ExecutionReadyPlan;
  readonly artifacts: ArtifactChain;
  readonly diagnostics: PipelineDiagnostics;
  readonly explanation: UnifiedExplanation;
  readonly statistics: ControlPlaneStatistics;
}
