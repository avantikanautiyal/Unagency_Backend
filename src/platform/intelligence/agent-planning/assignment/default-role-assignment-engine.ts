/**
 * Role assignment and specialization matching.
 */

import { success, type Result } from "../../shared/result";
import { asAgentId } from "../contracts/identifiers";
import type { AgentAssignment, RoleAssignmentMap } from "../contracts/assignment";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { IRoleAssignmentEngine, ISpecializationMatcher, IAgentRegistry } from "../interfaces/agent-planning";
import { getRoleForCapability, getRoleForTaskTitle } from "../registry/in-memory-agent-registry";

export class DefaultSpecializationMatcher implements ISpecializationMatcher {
  match(taskTitle: string, capabilityId: string): Result<{ role: string; confidence: number; fallbacks: readonly string[] }> {
    const byCap = getRoleForCapability(capabilityId);
    const byTitle = getRoleForTaskTitle(taskTitle);
    const match = byTitle.role !== "Copywriter" ? byTitle : byCap;
    return success({
      role: match.role,
      confidence: 0.85,
      fallbacks: match.fallbacks,
    });
  }
}

export class DefaultRoleAssignmentEngine implements IRoleAssignmentEngine {
  constructor(
    private readonly matcher: ISpecializationMatcher = new DefaultSpecializationMatcher(),
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`
  ) {}

  assign(plan: StructuredTaskPlan, _registry: IAgentRegistry): Result<RoleAssignmentMap> {
    const assignments: AgentAssignment[] = [];

    for (const node of plan.taskGraph.nodes) {
      const match = this.matcher.match(node.title, String(node.capabilityId));
      if (!match.ok) continue;

      assignments.push({
        assignmentId: this.createId("asgn"),
        taskNodeId: node.nodeId,
        taskTitle: node.title,
        primaryRole: match.value.role,
        primaryAgentId: asAgentId(match.value.role.toLowerCase().replace(/\s+/g, "_")),
        confidence: match.value.confidence,
        fallbackRoles: match.value.fallbacks,
        fallbackAgentIds: match.value.fallbacks.map((r) =>
          asAgentId(r.toLowerCase().replace(/\s+/g, "_"))
        ),
        rationale: `${match.value.role} best matches "${node.title}" based on capability ${node.capabilityId}`,
      });
    }

    return success({ assignments, unassignedTaskIds: [] });
  }
}
