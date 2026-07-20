/**
 * Agent assignment contracts.
 */

import type { AgentId } from "./identifiers";
import type { TaskNodeId } from "../../task-intelligence/contracts/identifiers";

export interface AgentAssignment {
  readonly assignmentId: string;
  readonly taskNodeId: TaskNodeId;
  readonly taskTitle: string;
  readonly primaryRole: string;
  readonly primaryAgentId: AgentId;
  readonly confidence: number;
  readonly fallbackRoles: readonly string[];
  readonly fallbackAgentIds: readonly AgentId[];
  readonly rationale: string;
}

export interface RoleAssignmentMap {
  readonly assignments: readonly AgentAssignment[];
  readonly unassignedTaskIds: readonly TaskNodeId[];
}
