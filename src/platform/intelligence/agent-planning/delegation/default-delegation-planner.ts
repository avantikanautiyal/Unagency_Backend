/**
 * Delegation planner.
 */

import { success, type Result } from "../../shared/result";
import type { AgentGraph } from "../contracts/graph";
import type { RoleAssignmentMap } from "../contracts/assignment";
import type { DelegationPlan } from "../contracts/delegation";
import type { IDelegationPlanner } from "../interfaces/agent-planning";

export class DefaultDelegationPlanner implements IDelegationPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(assignments: RoleAssignmentMap, _agentGraph: AgentGraph): Result<DelegationPlan> {
    const rules = assignments.assignments
      .filter((a) => a.fallbackRoles.length > 0)
      .map((a) => ({
        ruleId: this.createId("del"),
        fromAgentId: a.primaryAgentId,
        toAgentId: a.fallbackAgentIds[0],
        taskNodeId: a.taskNodeId,
        condition: `Primary role ${a.primaryRole} unavailable`,
      }));

    return success({
      planId: this.createId("delegation"),
      rules,
      rationale: "Fallback delegation when primary agent role is unavailable",
    });
  }
}
