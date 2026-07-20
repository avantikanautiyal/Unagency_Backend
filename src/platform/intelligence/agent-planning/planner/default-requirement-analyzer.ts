/**
 * Agent requirement analyzer.
 */

import { success, type Result } from "../../shared/result";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { IAgentRequirementAnalyzer } from "../interfaces/agent-planning";
import { getRoleForTaskTitle } from "../registry/in-memory-agent-registry";

export class DefaultAgentRequirementAnalyzer implements IAgentRequirementAnalyzer {
  analyze(plan: StructuredTaskPlan): Result<{ requiredRoles: readonly string[]; agentCount: number }> {
    const roleSet = new Set<string>();
    for (const node of plan.taskGraph.nodes) {
      const { role } = getRoleForTaskTitle(node.title);
      roleSet.add(role);
    }
    roleSet.add("QA Reviewer");
    roleSet.add("Human Approval");
    const roles = [...roleSet];
    return success({ requiredRoles: roles, agentCount: roles.length });
  }
}
