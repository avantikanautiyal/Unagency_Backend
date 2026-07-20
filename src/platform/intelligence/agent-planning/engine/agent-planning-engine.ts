/**
 * Agent Planning Engine — orchestrates multi-agent team planning.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asAgentPlanningResultId } from "../contracts/identifiers";
import type { AgentPlanningRequest } from "../contracts/request";
import type { AgentPlanningReport, AgentPlanningExplanation } from "../contracts/result";
import type {
  IAgentPlanningEngine,
  IAgentGraphBuilder,
  IAgentRegistry,
  IAgentRequirementAnalyzer,
  ICoordinationPlanner,
  ICommunicationPlanner,
  IDelegationPlanner,
  IEscalationPlanner,
  IExecutionTeamPlanner,
  IMergeStrategyPlanner,
  IParallelizationPlanner,
  IReviewHierarchyPlanner,
  IRoleAssignmentEngine,
  ITeamPlaybookRepository,
  ITeamRecommender,
} from "../interfaces/agent-planning";

export interface AgentPlanningEngineDeps {
  readonly registry: IAgentRegistry;
  readonly requirementAnalyzer: IAgentRequirementAnalyzer;
  readonly assignment: IRoleAssignmentEngine;
  readonly graphBuilder: IAgentGraphBuilder;
  readonly parallelization: IParallelizationPlanner;
  readonly coordination: ICoordinationPlanner;
  readonly communication: ICommunicationPlanner;
  readonly review: IReviewHierarchyPlanner;
  readonly merge: IMergeStrategyPlanner;
  readonly delegation: IDelegationPlanner;
  readonly escalation: IEscalationPlanner;
  readonly teamPlanner: IExecutionTeamPlanner;
  readonly teamRecommender: ITeamRecommender;
  readonly playbookRepo: ITeamPlaybookRepository;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class AgentPlanningEngine implements IAgentPlanningEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;

  constructor(private readonly deps: AgentPlanningEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async plan(request: AgentPlanningRequest): Promise<Result<AgentPlanningReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const taskPlan = request.structuredTaskPlan;
    const scenario = request.scenarioHint ?? "launch campaign";

    const playbookMatch = this.deps.playbookRepo.match(scenario);
    const playbook = playbookMatch.ok ? playbookMatch.value : undefined;
    const teamName = playbook?.name ?? "Execution Team";

    const requirements = this.deps.requirementAnalyzer.analyze(taskPlan);
    if (!requirements.ok) return requirements;

    const assignments = this.deps.assignment.assign(taskPlan, this.deps.registry);
    if (!assignments.ok) return assignments;

    const agentGraph = this.deps.graphBuilder.build(taskPlan, assignments.value, teamName);
    if (!agentGraph.ok) return agentGraph;

    const parallelGroups = this.deps.parallelization.plan(agentGraph.value, taskPlan);
    if (!parallelGroups.ok) return parallelGroups;

    const coordination = this.deps.coordination.plan(agentGraph.value, playbook);
    if (!coordination.ok) return coordination;

    const communication = this.deps.communication.plan(agentGraph.value);
    if (!communication.ok) return communication;

    const review = this.deps.review.plan(agentGraph.value, taskPlan);
    if (!review.ok) return review;

    const merge = this.deps.merge.plan(agentGraph.value, taskPlan);
    if (!merge.ok) return merge;

    const delegation = this.deps.delegation.plan(assignments.value, agentGraph.value);
    if (!delegation.ok) return delegation;

    const escalation = this.deps.escalation.plan(agentGraph.value, review.value);
    if (!escalation.ok) return escalation;

    const teamPlan = this.deps.teamPlanner.assemble(
      request,
      agentGraph.value,
      assignments.value,
      coordination.value,
      communication.value,
      review.value,
      merge.value,
      delegation.value,
      escalation.value,
      parallelGroups.value,
      teamName,
      playbook
    );
    if (!teamPlan.ok) return teamPlan;

    const recommendation = this.deps.teamRecommender.recommend(teamPlan.value);
    if (!recommendation.ok) return recommendation;

    const explanation = buildExplanation(
      assignments.value,
      agentGraph.value,
      review.value,
      merge.value,
      coordination.value,
      playbook?.name
    );

    const durationMs = this.clockMs() - start;

    return success({
      resultId: asAgentPlanningResultId((this.deps.createId ?? defaultId)("ap")),
      request,
      executionTeamPlan: teamPlan.value,
      agentGraph: agentGraph.value,
      roleAssignments: assignments.value,
      communicationPlan: communication.value,
      reviewHierarchy: review.value,
      mergePlan: merge.value,
      coordinationPlan: coordination.value,
      delegationPlan: delegation.value,
      escalationPlan: escalation.value,
      teamRecommendation: recommendation.value,
      explanation,
      statistics: {
        agentsRequired: agentGraph.value.nodes.length,
        parallelGroups: parallelGroups.value.length,
        reviewLevels: review.value.levels.length,
        assignments: assignments.value.assignments.length,
        durationMs,
      },
      createdAt: this.nowIso(),
    });
  }

  async explain(request: AgentPlanningRequest): Promise<Result<AgentPlanningExplanation>> {
    const result = await this.plan(request);
    if (!result.ok) return result;
    return success(result.value.explanation);
  }

  private validate(request: AgentPlanningRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.structuredTaskPlan) return new ValidationError("structuredTaskPlan required");
    return null;
  }
}

function defaultId(p: string): string {
  return `${p}_${Math.random().toString(36).slice(2)}`;
}

function buildExplanation(
  assignments: import("../contracts/assignment").RoleAssignmentMap,
  graph: import("../contracts/graph").AgentGraph,
  review: import("../contracts/review").ReviewHierarchy,
  merge: import("../contracts/merge").MergePlan,
  coordination: import("../contracts/coordination").CoordinationPlan,
  playbookName?: string
): AgentPlanningExplanation {
  return {
    roleSelectionRationale: `Assigned ${assignments.assignments.length} tasks to specialized roles by capability and task title matching`,
    dependencyRationale: `${graph.edges.length} agent dependencies mirror task workflow — research before strategy before creative`,
    reviewHierarchyRationale: review.rationale,
    mergeStrategyRationale: merge.rationale,
    fallbackRationale: "Each assignment includes fallback roles for resilience when primary agent unavailable",
    coordinationRationale: coordination.rationale,
    playbookApplied: playbookName,
  };
}
