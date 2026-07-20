/**
 * Agent Planning result contracts.
 */

import type { AgentPlanningResultId } from "./identifiers";
import type { AgentPlanningRequest } from "./request";
import type { ExecutionTeamPlan } from "./team-plan";
import type { AgentGraph } from "./graph";
import type { RoleAssignmentMap } from "./assignment";
import type { CommunicationPlan } from "./coordination";
import type { ReviewHierarchy } from "./review";
import type { MergePlan } from "./merge";
import type { CoordinationPlan } from "./coordination";
import type { DelegationPlan, EscalationPlan } from "./delegation";
import type { AgentPlanningExplanation, TeamRecommendation } from "./explainability";

export interface AgentPlanningStatistics {
  readonly agentsRequired: number;
  readonly parallelGroups: number;
  readonly reviewLevels: number;
  readonly assignments: number;
  readonly durationMs: number;
}

export interface AgentPlanningReport {
  readonly resultId: AgentPlanningResultId;
  readonly request: AgentPlanningRequest;
  readonly executionTeamPlan: ExecutionTeamPlan;
  readonly agentGraph: AgentGraph;
  readonly roleAssignments: RoleAssignmentMap;
  readonly communicationPlan: CommunicationPlan;
  readonly reviewHierarchy: ReviewHierarchy;
  readonly mergePlan: MergePlan;
  readonly coordinationPlan: CoordinationPlan;
  readonly delegationPlan: DelegationPlan;
  readonly escalationPlan: EscalationPlan;
  readonly teamRecommendation: TeamRecommendation;
  readonly explanation: AgentPlanningExplanation;
  readonly statistics: AgentPlanningStatistics;
  readonly createdAt: string;
}
