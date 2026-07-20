/**
 * Execution team planner and team recommender.
 */

import { success, type Result } from "../../shared/result";
import { asTeamPlanId } from "../contracts/identifiers";
import type { AgentPlanningRequest } from "../contracts/request";
import type { ExecutionTeamPlan, AgentTeamMember, ExecutionStageAgents } from "../contracts/team-plan";
import type { AgentGraph } from "../contracts/graph";
import type { RoleAssignmentMap } from "../contracts/assignment";
import type { CoordinationPlan, CommunicationPlan } from "../contracts/coordination";
import type { ReviewHierarchy } from "../contracts/review";
import type { MergePlan } from "../contracts/merge";
import type { DelegationPlan, EscalationPlan } from "../contracts/delegation";
import type { TeamPlaybook } from "../contracts/playbook";
import type { TeamRecommendation } from "../contracts/explainability";
import type { IExecutionTeamPlanner, ITeamRecommender } from "../interfaces/agent-planning";
import { AGENT_PLANNING_VERSION } from "../constants";

export class DefaultExecutionTeamPlanner implements IExecutionTeamPlanner {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  assemble(
    _request: AgentPlanningRequest,
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
    _playbook?: TeamPlaybook
  ): Result<ExecutionTeamPlan> {
    const teamMembers: AgentTeamMember[] = agentGraph.nodes.map((n) => ({
      agentId: n.agentId,
      role: n.role,
      responsibilities: n.taskNodeIds.length
        ? [`Execute tasks: ${n.taskNodeIds.length} assigned`]
        : [n.isReviewer ? "Quality review" : n.isHumanGate ? "Final approval" : "Team coordination"],
      taskNodeIds: n.taskNodeIds,
    }));

    const stageMap = new Map<number, import("../contracts/identifiers").AgentId[]>();
    for (const n of agentGraph.nodes) {
      const list = stageMap.get(n.stage) ?? [];
      list.push(n.agentId);
      stageMap.set(n.stage, list);
    }

    const executionStages: ExecutionStageAgents[] = [...stageMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([stage, agentIds]) => ({
        stage,
        name: `Stage ${stage}`,
        agentIds,
        parallel: agentIds.length > 1,
      }));

    const fallbackRoles: Record<string, string[]> = {};
    for (const a of assignments.assignments) {
      fallbackRoles[a.primaryRole] = [...a.fallbackRoles];
    }

    return success({
      planId: asTeamPlanId(this.createId("etp")),
      teamName,
      teamMembers,
      agentGraph,
      roleAssignments: assignments,
      communicationPlan: communication,
      reviewHierarchy: review,
      executionStages,
      mergePlan: merge,
      coordinationPlan: coordination,
      delegationPlan: delegation,
      escalationPlan: escalation,
      parallelGroups,
      fallbackRoles,
      primaryCoordination: coordination.primaryStrategy,
      version: AGENT_PLANNING_VERSION,
      createdAt: this.nowIso(),
    });
  }
}

export class DefaultTeamRecommender implements ITeamRecommender {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  recommend(teamPlan: ExecutionTeamPlan): Result<TeamRecommendation> {
    return success({
      recommendationId: this.createId("rec"),
      teamName: teamPlan.teamName,
      recommendedRoles: teamPlan.teamMembers.map((m) => m.role),
      confidence: 0.9,
      rationale: `${teamPlan.teamMembers.length} agents organized for ${teamPlan.teamName}`,
    });
  }
}
