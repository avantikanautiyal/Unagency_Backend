/**
 * Workflow Intelligence public interfaces.
 */

import type { Result } from "../../shared/result";
import type { WorkflowIntelligenceRequest } from "../contracts/request";
import type { WorkflowIntelligenceReport, WorkflowExplanation } from "../contracts/result";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { WorkflowStage } from "../contracts/stages";
import type { ApprovalPlan } from "../contracts/approvals";
import type { CheckpointPlan } from "../contracts/checkpoints";
import type { RollbackPlan, RecoveryPlan, ResumePlan } from "../contracts/recovery";
import type { WorkflowExecutionPlan } from "../contracts/plan";
import type {
  SimulationReport,
  WorkflowOptimizationReport,
  WorkflowValidationReport,
} from "../contracts/simulation";

export interface IWorkflowIntelligenceEngine {
  plan(request: WorkflowIntelligenceRequest): Promise<Result<WorkflowIntelligenceReport>>;
  explain(request: WorkflowIntelligenceRequest): Promise<Result<WorkflowExplanation>>;
  simulate(request: WorkflowIntelligenceRequest): Promise<Result<SimulationReport>>;
}

export interface IWorkflowAnalyzer {
  analyze(teamPlan: ExecutionTeamPlan): Result<{ name: string; nodeCount: number }>;
}

export interface IStageBuilder {
  build(teamPlan: ExecutionTeamPlan, graph: ExecutionWorkflowGraph): Result<readonly WorkflowStage[]>;
}

export interface IExecutionGraphBuilder {
  build(teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph>;
}

export interface IDependencyPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph>;
}

export interface IParallelizationPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph>;
}

export interface IConditionalBranchPlanner {
  plan(graph: ExecutionWorkflowGraph): Result<ExecutionWorkflowGraph>;
}

export interface IApprovalPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<ApprovalPlan>;
}

export interface ICheckpointPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<CheckpointPlan>;
}

export interface IFailureRecoveryPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<RecoveryPlan>;
}

export interface IRollbackPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<RollbackPlan>;
}

export interface IResumePlanner {
  plan(graph: ExecutionWorkflowGraph, checkpoints: CheckpointPlan): Result<ResumePlan>;
}

export interface IWorkflowSimulator {
  simulate(graph: ExecutionWorkflowGraph, stages: readonly WorkflowStage[]): Result<SimulationReport>;
}

export interface IWorkflowOptimizer {
  optimize(graph: ExecutionWorkflowGraph, stages: readonly WorkflowStage[]): Result<WorkflowOptimizationReport>;
}

export interface IWorkflowValidator {
  validate(plan: WorkflowExecutionPlan): Result<WorkflowValidationReport>;
}

export interface IWorkflowExecutionPlanner {
  assemble(
    request: WorkflowIntelligenceRequest,
    graph: ExecutionWorkflowGraph,
    stages: readonly WorkflowStage[],
    approval: ApprovalPlan,
    checkpoints: CheckpointPlan,
    rollback: RollbackPlan,
    recovery: RecoveryPlan,
    resume: ResumePlan
  ): Result<WorkflowExecutionPlan>;
}
