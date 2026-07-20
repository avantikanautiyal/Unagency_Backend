/**
 * Execution team plan — primary output artifact.
 */

import type { TeamPlanId, AgentId } from "./identifiers";
import type { TaskNodeId } from "../../task-intelligence/contracts/identifiers";
import type { AgentGraph } from "./graph";
import type { RoleAssignmentMap } from "./assignment";
import type { CoordinationPlan, CommunicationPlan } from "./coordination";
import type { ReviewHierarchy } from "./review";
import type { MergePlan } from "./merge";
import type { DelegationPlan, EscalationPlan } from "./delegation";
import type { CoordinationStrategyKind } from "./enums";

export interface AgentTeamMember {
  readonly agentId: AgentId;
  readonly role: string;
  readonly responsibilities: readonly string[];
  readonly taskNodeIds: readonly TaskNodeId[];
}

export interface ExecutionStageAgents {
  readonly stage: number;
  readonly name: string;
  readonly agentIds: readonly AgentId[];
  readonly parallel: boolean;
}

export interface ExecutionTeamPlan {
  readonly planId: TeamPlanId;
  readonly teamName: string;
  readonly teamMembers: readonly AgentTeamMember[];
  readonly agentGraph: AgentGraph;
  readonly roleAssignments: RoleAssignmentMap;
  readonly communicationPlan: CommunicationPlan;
  readonly reviewHierarchy: ReviewHierarchy;
  readonly executionStages: readonly ExecutionStageAgents[];
  readonly mergePlan: MergePlan;
  readonly coordinationPlan: CoordinationPlan;
  readonly delegationPlan: DelegationPlan;
  readonly escalationPlan: EscalationPlan;
  readonly parallelGroups: readonly (readonly AgentId[])[];
  readonly fallbackRoles: Readonly<Record<string, readonly string[]>>;
  readonly primaryCoordination: CoordinationStrategyKind;
  readonly version: string;
  readonly createdAt: string;
}
