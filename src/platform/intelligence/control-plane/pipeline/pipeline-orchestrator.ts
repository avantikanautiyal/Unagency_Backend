/**
 * Pipeline orchestrator — deterministic end-to-end planning.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asExecutionReadyPlanId } from "../contracts/identifiers";
import type { ControlPlaneRequest } from "../contracts/request";
import type { ArtifactChain } from "../contracts/artifacts";
import type { PipelineDiagnostics, StageDiagnostic } from "../contracts/diagnostics";
import type { ExecutionReadyPlan } from "../contracts/plan";
import type { UnifiedExplanation } from "../contracts/explainability";
import type { ControlPlaneStatistics } from "../contracts/result";
import type { PipelineStageKind } from "../contracts/enums";
import type { StageTiming } from "../contracts/context";
import type { IPipelineOrchestrator, PipelineOrchestratorResult } from "../interfaces/control-plane";
import { CONTROL_PLANE_VERSION } from "../constants";
import type { ITaskIntelligenceEngine } from "../../task-intelligence/interfaces/task-intelligence";
import type { IAgentPlanningEngine } from "../../agent-planning/interfaces/agent-planning";
import type { IWorkflowIntelligenceEngine } from "../../workflow-intelligence/interfaces/workflow-intelligence";
import type { IExecutionGovernanceEngine } from "../../execution-governance/interfaces/execution-governance";
import type { IExecutionIntelligenceEngine } from "../../execution-intelligence/interfaces/execution-intelligence";
import type { IModelIntelligenceEngine } from "../../model-intelligence/interfaces/model-intelligence";
import type { IProviderNegotiationEngine } from "../../providers/negotiation/interfaces/negotiation-engine";
import type { IProviderRoutingEngine } from "../../providers/routing/interfaces/routing";
import {
  buildExecutionIntelligenceRequest,
  buildModelIntelligenceRequest,
  buildNegotiationRequest,
  buildRoutingCandidates,
  buildRoutingRequest,
} from "./stage-adapters";
import type { ExecutionContextResolver } from "../../../business/execution-context";

export interface PipelineOrchestratorDeps {
  readonly taskIntelligence: ITaskIntelligenceEngine;
  readonly agentPlanning: IAgentPlanningEngine;
  readonly workflowIntelligence: IWorkflowIntelligenceEngine;
  readonly executionGovernance: IExecutionGovernanceEngine;
  readonly executionIntelligence: IExecutionIntelligenceEngine;
  readonly modelIntelligence: IModelIntelligenceEngine;
  readonly negotiation: IProviderNegotiationEngine;
  readonly routing: IProviderRoutingEngine;
  readonly executionContextResolver: ExecutionContextResolver;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class PipelineOrchestrator implements IPipelineOrchestrator {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: PipelineOrchestratorDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async execute(request: ControlPlaneRequest): Promise<Result<PipelineOrchestratorResult>> {
    const start = this.clockMs();
    const timings: StageTiming[] = [];
    const stageResults: StageDiagnostic[] = [];
    const warnings: string[] = [];

    if (!request.rawPrompt?.trim()) {
      return failure(new ValidationError("rawPrompt required"));
    }

    // Stage 1: Task Intelligence
    const taskResult = await this.runStage("task_intelligence", timings, async () => {
      return this.deps.taskIntelligence.analyze({
        requestId: `${request.requestId}_ti`,
        rawPrompt: request.rawPrompt,
        industryHint: request.scenarioHint,
        budgetHint: request.budgetLimit,
        regionHint: request.regionHint,
      });
    });
    if (!taskResult.ok) return taskResult;
    stageResults.push(diag("task_intelligence", true, "Task plan produced"));

    // Stage 2: Agent Planning
    const agentResult = await this.runStage("agent_planning", timings, async () => {
      return this.deps.agentPlanning.plan({
        requestId: `${request.requestId}_ap`,
        structuredTaskPlan: taskResult.value.structuredTaskPlan,
        scenarioHint: request.scenarioHint ?? request.rawPrompt,
      });
    });
    if (!agentResult.ok) return agentResult;
    stageResults.push(diag("agent_planning", true, "Team plan produced"));

    // Stage 3: Workflow Intelligence
    const workflowResult = await this.runStage("workflow_intelligence", timings, async () => {
      return this.deps.workflowIntelligence.plan({
        requestId: `${request.requestId}_wi`,
        executionTeamPlan: agentResult.value.executionTeamPlan,
        scenarioHint: request.scenarioHint,
      });
    });
    if (!workflowResult.ok) return workflowResult;
    stageResults.push(diag("workflow_intelligence", true, "Workflow plan produced"));

    // Stage 4: Execution Governance
    const govResult = await this.runStage("execution_governance", timings, async () => {
      return this.deps.executionGovernance.evaluate({
        requestId: `${request.requestId}_gov`,
        workflowExecutionPlan: workflowResult.value.workflowExecutionPlan,
        budgetLimit: request.budgetLimit,
        tokenBudgetLimit: request.tokenBudgetLimit,
        regionHint: request.regionHint,
        organizationId: request.organizationId ? String(request.organizationId) : undefined,
        workspaceId: request.workspaceId ? String(request.workspaceId) : undefined,
      });
    });
    if (!govResult.ok) return govResult;
    stageResults.push(diag("execution_governance", true, "Governance evaluation complete"));

    if (!govResult.value.governanceExecutionPlan.authorization.authorized &&
        govResult.value.governanceExecutionPlan.decision.kind === "blocked") {
      warnings.push("Governance blocked execution — plan produced for review");
    }

    // Stage 5: Execution Intelligence (never receives RawRequest)
    const execIntelReq = await buildExecutionIntelligenceRequest(
      `${request.requestId}_ei`,
      taskResult.value,
      govResult.value,
      this.deps.executionContextResolver
    );
    const execIntelResult = await this.runStage("execution_intelligence", timings, async () => {
      return this.deps.executionIntelligence.optimize(execIntelReq);
    });
    if (!execIntelResult.ok) return execIntelResult;
    stageResults.push(diag("execution_intelligence", true, "Execution strategy optimized"));

    // Stage 6: Model Intelligence (never receives RawRequest)
    const modelReq = buildModelIntelligenceRequest(
      `${request.requestId}_mi`,
      taskResult.value,
      govResult.value
    );
    const modelResult = await this.runStage("model_intelligence", timings, async () => {
      return this.deps.modelIntelligence.recommend(modelReq);
    });
    if (!modelResult.ok) return modelResult;
    stageResults.push(diag("model_intelligence", true, "Models ranked"));

    // Stage 7: Negotiation
    const negReq = buildNegotiationRequest(
      `${request.requestId}_neg`,
      taskResult.value,
      execIntelResult.value
    );
    const negResult = await this.runStage("negotiation", timings, async () => {
      return this.deps.negotiation.negotiate(negReq);
    });
    if (!negResult.ok) return negResult;
    stageResults.push(diag("negotiation", true, "Provider negotiation complete"));

    // Stage 8: Routing (never receives RawRequest)
    const routingCandidates = buildRoutingCandidates(modelResult.value);
    const routeReq = buildRoutingRequest(
      `${request.requestId}_route`,
      modelResult.value,
      routingCandidates
    );
    const routeResult = await this.runStage("routing", timings, async () => {
      return this.deps.routing.route(routeReq);
    });
    if (!routeResult.ok) return routeResult;
    stageResults.push(diag("routing", true, "Routing decision produced"));

    const now = this.nowIso();
    const artifacts: ArtifactChain = {
      task: { artifactId: this.createId("art_task"), report: taskResult.value, createdAt: now },
      team: { artifactId: this.createId("art_team"), report: agentResult.value, createdAt: now },
      workflow: { artifactId: this.createId("art_wf"), report: workflowResult.value, createdAt: now },
      governance: { artifactId: this.createId("art_gov"), report: govResult.value, createdAt: now },
      executionIntelligence: { artifactId: this.createId("art_ei"), result: execIntelResult.value, createdAt: now },
      modelDecision: { artifactId: this.createId("art_mi"), result: modelResult.value, createdAt: now },
      negotiation: { artifactId: this.createId("art_neg"), result: negResult.value, createdAt: now },
      routing: { artifactId: this.createId("art_route"), decision: routeResult.value, createdAt: now },
    };

    const explanation = buildUnifiedExplanation(
      taskResult.value,
      agentResult.value,
      workflowResult.value,
      govResult.value,
      execIntelResult.value,
      modelResult.value,
      negResult.value,
      routeResult.value
    );

    const diagnostics: PipelineDiagnostics = {
      diagnosticsId: this.createId("diag"),
      stageTimings: timings,
      stageResults,
      validationPassed: true,
      recommendations: warnings,
      explainabilityRefs: Object.keys(explanation.stageSummaries),
    };

    const authorized = govResult.value.governanceExecutionPlan.authorization.authorized;

    const executionReadyPlan: ExecutionReadyPlan = {
      planId: asExecutionReadyPlanId(this.createId("erp")),
      requestId: request.requestId,
      structuredTaskPlan: taskResult.value.structuredTaskPlan,
      executionTeamPlan: agentResult.value.executionTeamPlan,
      workflowExecutionPlan: workflowResult.value.workflowExecutionPlan,
      governanceExecutionPlan: govResult.value.governanceExecutionPlan,
      executionIntelligenceResult: execIntelResult.value,
      rankedModelCandidates: modelResult.value.candidates,
      negotiationResult: negResult.value,
      routingDecision: routeResult.value,
      executionConstraints: govResult.value.governanceExecutionPlan.decision.conditions ?? [],
      diagnostics,
      explanation,
      artifacts,
      authorized,
      version: CONTROL_PLANE_VERSION,
      createdAt: now,
    };

    artifacts.executionReady = {
      artifactId: this.createId("art_ready"),
      planId: String(executionReadyPlan.planId),
      createdAt: now,
    };

    const totalDurationMs = this.clockMs() - start;
    const statistics: ControlPlaneStatistics = {
      stagesExecuted: timings.length,
      totalDurationMs,
      authorized,
    };

    return success({
      executionReadyPlan: { ...executionReadyPlan, artifacts: { ...artifacts, executionReady: artifacts.executionReady } },
      artifacts: { ...artifacts, executionReady: artifacts.executionReady },
      diagnostics,
      explanation,
      statistics,
    });
  }

  private async runStage<T>(
    stage: PipelineStageKind,
    timings: StageTiming[],
    fn: () => Promise<Result<T>>
  ): Promise<Result<T>> {
    const stageStart = this.clockMs();
    const startedAt = this.nowIso();
    const result = await fn();
    const completedAt = this.nowIso();
    timings.push({
      stage,
      startedAt,
      completedAt,
      durationMs: this.clockMs() - stageStart,
      state: result.ok ? "completed" : "failed",
    });
    return result;
  }
}

function diag(stage: PipelineStageKind, success: boolean, message: string): StageDiagnostic {
  return { stage, success, message, warnings: [] };
}

function buildUnifiedExplanation(
  task: import("../../task-intelligence/contracts/result").TaskIntelligenceReport,
  agent: import("../../agent-planning/contracts/result").AgentPlanningReport,
  workflow: import("../../workflow-intelligence/contracts/result").WorkflowIntelligenceReport,
  gov: import("../../execution-governance/contracts/result").GovernanceReport,
  execIntel: import("../../execution-intelligence/contracts/result").ExecutionIntelligenceResult,
  model: import("../../model-intelligence/contracts/result").ModelIntelligenceResult,
  neg: import("../../providers/negotiation/contracts/negotiation-result").NegotiationResult,
  route: import("../../providers/routing/contracts/plan").RoutingDecision
): UnifiedExplanation {
  const primary = model.candidates.candidates[0];
  return {
    summary: `End-to-end planning for "${task.request.rawPrompt.slice(0, 50)}" through 8 intelligence stages`,
    taskRationale: task.explanation.classificationRationale,
    agentRationale: agent.explanation.roleSelectionRationale,
    workflowRationale: workflow.explanation.stageRationale,
    governanceRationale: gov.explanation.approvalRationale,
    executionStrategyRationale: `Strategy ${execIntel.strategy.kind} with mode ${execIntel.mode.kind}`,
    modelRecommendationRationale: primary?.explanation.summary ?? "Model ranking complete",
    negotiationRationale: neg.summary,
    routingRationale: `Routed to ${route.plan.primary.providerId} via ${route.strategy}`,
    stageSummaries: {
      task_intelligence: task.explanation.decompositionRationale,
      agent_planning: agent.explanation.coordinationRationale,
      workflow_intelligence: workflow.explanation.parallelRationale,
      execution_governance: gov.explanation.blockRationale ?? gov.explanation.approvalRationale,
      execution_intelligence: execIntel.optimizationReport.summary,
      model_intelligence: primary?.explanation.whyRanked ?? "",
      negotiation: String(neg.decision),
      routing: route.plan.primary.reason,
    },
  };
}
