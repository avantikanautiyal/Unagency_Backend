/**
 * Agent graph builder and dependency planner.
 */

import { success, type Result } from "../../shared/result";
import { asAgentGraphId, asAgentId } from "../contracts/identifiers";
import type { AgentGraph, AgentNode, AgentEdge } from "../contracts/graph";
import type { RoleAssignmentMap } from "../contracts/assignment";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { IAgentGraphBuilder, IDependencyPlanner, IParallelizationPlanner } from "../interfaces/agent-planning";

export class DefaultAgentGraphBuilder implements IAgentGraphBuilder {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  build(
    plan: StructuredTaskPlan,
    assignments: RoleAssignmentMap,
    teamName: string
  ): Result<AgentGraph> {
    const roleMap = new Map<string, { role: string; taskIds: string[]; stage: number; parallelGroup?: string }>();

    for (const a of assignments.assignments) {
      const node = plan.taskGraph.nodes.find((n) => n.nodeId === a.taskNodeId);
      const key = a.primaryRole;
      const existing = roleMap.get(key);
      if (existing) {
        existing.taskIds.push(String(a.taskNodeId));
      } else {
        roleMap.set(key, {
          role: a.primaryRole,
          taskIds: [String(a.taskNodeId)],
          stage: node?.stage ?? 1,
          parallelGroup: node?.parallelGroup,
        });
      }
    }

    // Add QA and Human Approval
    const maxStage = Math.max(...plan.taskGraph.nodes.map((n) => n.stage), 1);
    roleMap.set("QA Reviewer", { role: "QA Reviewer", taskIds: [], stage: maxStage + 1, parallelGroup: undefined });
    roleMap.set("Human Approval", { role: "Human Approval", taskIds: [], stage: maxStage + 2, parallelGroup: undefined });

    const nodes: AgentNode[] = [...roleMap.entries()]
      .sort(([, a], [, b]) => a.stage - b.stage)
      .map(([, v]) => ({
        agentId: asAgentId(v.role.toLowerCase().replace(/\s+/g, "_")),
        role: v.role,
        department: inferDepartment(v.role),
        taskNodeIds: v.taskIds as never[],
        stage: v.stage,
        parallelGroup: v.parallelGroup,
        isReviewer: v.role === "QA Reviewer",
        isSupervisor: v.role === "Creative Director" || v.role === "Campaign Strategist",
        isHumanGate: v.role === "Human Approval",
      }));

    const edges = buildAgentEdges(nodes, plan);

    return success({
      graphId: asAgentGraphId(this.createId("ag")),
      teamName,
      nodes,
      edges,
      rootAgents: nodes.filter((n) => n.stage === 1).map((n) => n.agentId),
      leafAgents: nodes.filter((n) => n.isHumanGate || n.isReviewer).map((n) => n.agentId),
      humanApprovalRequired: true,
    });
  }
}

export class DefaultDependencyPlanner implements IDependencyPlanner {
  plan(agentGraph: AgentGraph, taskPlan: StructuredTaskPlan): Result<AgentGraph> {
    const edges = buildAgentEdges(agentGraph.nodes, taskPlan);
    return success({ ...agentGraph, edges });
  }
}

export class DefaultParallelizationPlanner implements IParallelizationPlanner {
  plan(agentGraph: AgentGraph, _taskPlan: StructuredTaskPlan): Result<readonly (readonly import("../contracts/identifiers").AgentId[])[]> {
    const groups = new Map<string, import("../contracts/identifiers").AgentId[]>();
    for (const n of agentGraph.nodes) {
      if (!n.parallelGroup || n.isReviewer || n.isHumanGate) continue;
      const list = groups.get(n.parallelGroup) ?? [];
      list.push(n.agentId);
      groups.set(n.parallelGroup, list);
    }
    return success([...groups.values()].filter((g) => g.length > 1));
  }
}

function buildAgentEdges(nodes: readonly AgentNode[], plan: StructuredTaskPlan): AgentEdge[] {
  const edges: AgentEdge[] = [];
  const sorted = [...nodes].sort((a, b) => a.stage - b.stage);

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (from.isHumanGate) continue;
    edges.push({
      from: from.agentId,
      to: to.agentId,
      artifactType: from.isReviewer ? "review_artifact" : "task_artifact",
      rationale: `${from.role} produces artifacts consumed by ${to.role}`,
    });
  }

  // Research → Strategist chain
  const research = nodes.find((n) => n.role.includes("Research") || n.role.includes("Audience"));
  const strategist = nodes.find((n) => n.role.includes("Strategist") || n.role.includes("Campaign"));
  if (research && strategist && research.agentId !== strategist.agentId) {
    if (!edges.some((e) => e.from === research.agentId && e.to === strategist.agentId)) {
      edges.push({
        from: research.agentId,
        to: strategist.agentId,
        artifactType: "research_artifact",
        rationale: "Research findings inform campaign strategy",
      });
    }
  }

  return edges;
}

function inferDepartment(role: string): string {
  if (role.includes("Engineer") || role.includes("Architect")) return "software_engineering";
  if (role.includes("Designer") || role.includes("Editor")) return "design";
  if (role.includes("Analyst") || role.includes("Intelligence") || role.includes("Research")) return "research";
  if (role === "Human Approval") return "business";
  return "marketing";
}
