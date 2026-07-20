/**
 * Workflow Intelligence Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asWorkflowIntelligenceResultId } from "../contracts/identifiers";
import type { WorkflowIntelligenceRequest } from "../contracts/request";
import type { WorkflowIntelligenceReport, WorkflowExplanation } from "../contracts/result";
import type { SimulationReport } from "../contracts/simulation";
import type {
  IWorkflowIntelligenceEngine,
  IWorkflowAnalyzer,
  IStageBuilder,
  IExecutionGraphBuilder,
  IDependencyPlanner,
  IParallelizationPlanner,
  IConditionalBranchPlanner,
  IApprovalPlanner,
  ICheckpointPlanner,
  IFailureRecoveryPlanner,
  IRollbackPlanner,
  IResumePlanner,
  IWorkflowSimulator,
  IWorkflowOptimizer,
  IWorkflowValidator,
  IWorkflowExecutionPlanner,
} from "../interfaces/workflow-intelligence";

export interface WorkflowIntelligenceEngineDeps {
  readonly analyzer: IWorkflowAnalyzer;
  readonly graphBuilder: IExecutionGraphBuilder;
  readonly stageBuilder: IStageBuilder;
  readonly dependency: IDependencyPlanner;
  readonly parallelization: IParallelizationPlanner;
  readonly conditional: IConditionalBranchPlanner;
  readonly approval: IApprovalPlanner;
  readonly checkpoints: ICheckpointPlanner;
  readonly rollback: IRollbackPlanner;
  readonly recovery: IFailureRecoveryPlanner;
  readonly resume: IResumePlanner;
  readonly simulator: IWorkflowSimulator;
  readonly optimizer: IWorkflowOptimizer;
  readonly validator: IWorkflowValidator;
  readonly executionPlanner: IWorkflowExecutionPlanner;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class WorkflowIntelligenceEngine implements IWorkflowIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;

  constructor(private readonly deps: WorkflowIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async plan(request: WorkflowIntelligenceRequest): Promise<Result<WorkflowIntelligenceReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const teamPlan = request.executionTeamPlan;

    const analysis = this.deps.analyzer.analyze(teamPlan);
    if (!analysis.ok) return analysis;

    let graph = this.deps.graphBuilder.build(teamPlan);
    if (!graph.ok) return graph;

    graph = this.deps.dependency.plan(graph.value, teamPlan);
    if (!graph.ok) return graph;

    graph = this.deps.parallelization.plan(graph.value, teamPlan);
    if (!graph.ok) return graph;

    graph = this.deps.conditional.plan(graph.value);
    if (!graph.ok) return graph;

    const stages = this.deps.stageBuilder.build(teamPlan, graph.value);
    if (!stages.ok) return stages;

    const approval = this.deps.approval.plan(graph.value, teamPlan);
    if (!approval.ok) return approval;

    const checkpointPlan = this.deps.checkpoints.plan(graph.value, teamPlan);
    if (!checkpointPlan.ok) return checkpointPlan;

    const rollback = this.deps.rollback.plan(graph.value, teamPlan);
    if (!rollback.ok) return rollback;

    const recovery = this.deps.recovery.plan(graph.value, teamPlan);
    if (!recovery.ok) return recovery;

    const resume = this.deps.resume.plan(graph.value, checkpointPlan.value);
    if (!resume.ok) return resume;

    const workflowPlan = this.deps.executionPlanner.assemble(
      request,
      graph.value,
      stages.value,
      approval.value,
      checkpointPlan.value,
      rollback.value,
      recovery.value,
      resume.value
    );
    if (!workflowPlan.ok) return workflowPlan;

    const simulation = this.deps.simulator.simulate(graph.value, stages.value);
    if (!simulation.ok) return simulation;

    const optimization = this.deps.optimizer.optimize(graph.value, stages.value);
    if (!optimization.ok) return optimization;

    const validation = this.deps.validator.validate(workflowPlan.value);
    if (!validation.ok) return validation;

    const explanation = buildExplanation(
      stages.value,
      graph.value,
      approval.value,
      rollback.value,
      checkpointPlan.value,
      recovery.value
    );

    const durationMs = this.clockMs() - start;

    return success({
      resultId: asWorkflowIntelligenceResultId((this.deps.createId ?? defaultId)("wi")),
      request,
      workflowExecutionPlan: workflowPlan.value,
      graph: graph.value,
      stages: stages.value,
      checkpoints: checkpointPlan.value,
      simulation: simulation.value,
      optimization: optimization.value,
      validation: validation.value,
      explanation,
      statistics: {
        nodes: graph.value.nodes.length,
        edges: graph.value.edges.length,
        stages: stages.value.length,
        parallelGroups: graph.value.parallelGroups.length,
        approvalGates: approval.value.gates.length,
        checkpoints: checkpointPlan.value.checkpoints.length,
        durationMs,
      },
      createdAt: this.nowIso(),
    });
  }

  async explain(request: WorkflowIntelligenceRequest): Promise<Result<WorkflowExplanation>> {
    const result = await this.plan(request);
    if (!result.ok) return result;
    return success(result.value.explanation);
  }

  async simulate(request: WorkflowIntelligenceRequest): Promise<Result<SimulationReport>> {
    const result = await this.plan(request);
    if (!result.ok) return result;
    return success(result.value.simulation);
  }

  private validate(request: WorkflowIntelligenceRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.executionTeamPlan) return new ValidationError("executionTeamPlan required");
    return null;
  }
}

function defaultId(p: string): string {
  return `${p}_${Math.random().toString(36).slice(2)}`;
}

function buildExplanation(
  stages: readonly import("../contracts/stages").WorkflowStage[],
  graph: import("../contracts/graph").ExecutionWorkflowGraph,
  approval: import("../contracts/approvals").ApprovalPlan,
  rollback: import("../contracts/recovery").RollbackPlan,
  checkpoints: import("../contracts/checkpoints").CheckpointPlan,
  recovery: import("../contracts/recovery").RecoveryPlan
): WorkflowExplanation {
  return {
    stageRationale: `${stages.length} stages follow research → planning → generation → review → approval flow`,
    dependencyRationale: `${graph.edges.length} dependencies ensure artifact handoffs between agents`,
    approvalRationale: approval.rationale,
    parallelRationale: `${graph.parallelGroups.length} parallel groups detected for concurrent creative work`,
    rollbackRationale: rollback.rationale,
    checkpointRationale: checkpoints.rationale,
    recoveryRationale: recovery.rationale,
  };
}
