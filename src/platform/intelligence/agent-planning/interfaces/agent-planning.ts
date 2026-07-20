/**
 * Agent Planning public interfaces.
 */

import type { Result } from "../../shared/result";
import type { AgentPlanningRequest } from "../contracts/request";
import type { AgentPlanningReport, AgentPlanningExplanation } from "../contracts/result";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { AgentRoleProfile } from "../contracts/agent-profile";
import type { RoleAssignmentMap } from "../contracts/assignment";
import type { AgentGraph } from "../contracts/graph";
import type { CoordinationPlan, CommunicationPlan } from "../contracts/coordination";
import type { MergePlan } from "../contracts/merge";
import type { ReviewHierarchy } from "../contracts/review";
import type { DelegationPlan, EscalationPlan } from "../contracts/delegation";
import type { ExecutionTeamPlan } from "../contracts/team-plan";
import type { TeamPlaybook } from "../contracts/playbook";
import type { TeamRecommendation } from "../contracts/explainability";

export interface IAgentPlanningEngine {
  plan(request: AgentPlanningRequest): Promise<Result<AgentPlanningReport>>;
  explain(request: AgentPlanningRequest): Promise<Result<AgentPlanningExplanation>>;
}

export interface IAgentRegistry {
  list(): Result<readonly AgentRoleProfile[]>;
  get(role: string): Result<AgentRoleProfile>;
  findByCapability(capabilityId: string): Result<readonly AgentRoleProfile[]>;
}

export interface IAgentRequirementAnalyzer {
  analyze(plan: StructuredTaskPlan): Result<{ requiredRoles: readonly string[]; agentCount: number }>;
}

export interface IRoleAssignmentEngine {
  assign(plan: StructuredTaskPlan, registry: IAgentRegistry): Result<RoleAssignmentMap>;
}

export interface ISpecializationMatcher {
  match(taskTitle: string, capabilityId: string): Result<{ role: string; confidence: number; fallbacks: readonly string[] }>;
}

export interface IAgentGraphBuilder {
  build(
    plan: StructuredTaskPlan,
    assignments: RoleAssignmentMap,
    teamName: string
  ): Result<AgentGraph>;
}

export interface IDependencyPlanner {
  plan(agentGraph: AgentGraph, taskPlan: StructuredTaskPlan): Result<AgentGraph>;
}

export interface IParallelizationPlanner {
  plan(agentGraph: AgentGraph, taskPlan: StructuredTaskPlan): Result<readonly (readonly import("../contracts/identifiers").AgentId[])[]>;
}

export interface ICoordinationPlanner {
  plan(agentGraph: AgentGraph, playbook?: TeamPlaybook): Result<CoordinationPlan>;
}

export interface IReviewHierarchyPlanner {
  plan(agentGraph: AgentGraph, taskPlan: StructuredTaskPlan): Result<ReviewHierarchy>;
}

export interface IMergeStrategyPlanner {
  plan(agentGraph: AgentGraph, taskPlan: StructuredTaskPlan): Result<MergePlan>;
}

export interface ICommunicationPlanner {
  plan(agentGraph: AgentGraph): Result<CommunicationPlan>;
}

export interface IDelegationPlanner {
  plan(assignments: RoleAssignmentMap, agentGraph: AgentGraph): Result<DelegationPlan>;
}

export interface IEscalationPlanner {
  plan(agentGraph: AgentGraph, reviewHierarchy: ReviewHierarchy): Result<EscalationPlan>;
}

export interface ITeamPlaybookRepository {
  list(): Result<readonly TeamPlaybook[]>;
  match(scenarioHint: string): Result<TeamPlaybook | undefined>;
}

export interface IExecutionTeamPlanner {
  assemble(
    request: AgentPlanningRequest,
    agentGraph: AgentGraph,
    assignments: RoleAssignmentMap,
    coordination: CoordinationPlan,
    communication: CommunicationPlan,
    review: ReviewHierarchy,
    merge: MergePlan,
    delegation: DelegationPlan,
    escalation: EscalationPlan,
    parallelGroups: readonly (readonly import("../contracts/identifiers").AgentId[])[],
    teamName: string,
    playbook?: TeamPlaybook
  ): Result<ExecutionTeamPlan>;
}

export interface ITeamRecommender {
  recommend(teamPlan: ExecutionTeamPlan): Result<TeamRecommendation>;
}
