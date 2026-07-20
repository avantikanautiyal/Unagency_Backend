/**
 * Execution graph builder.
 */

import { success, type Result } from "../../shared/result";
import {
  asWorkflowGraphId,
  asWorkflowNodeId,
  asWorkflowEdgeId,
} from "../contracts/identifiers";
import type { ExecutionWorkflowGraph, WorkflowNode, WorkflowEdge } from "../contracts/graph";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { IExecutionGraphBuilder } from "../interfaces/workflow-intelligence";
import { stageForRole, STAGE_ORDER, artifactsForStage } from "../workflow/stage-mapping";

export class DefaultExecutionGraphBuilder implements IExecutionGraphBuilder {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  build(teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph> {
    const nodes: WorkflowNode[] = teamPlan.teamMembers.map((member, i) => {
      const stage = stageForRole(member.role);
      const arts = artifactsForStage(stage);
      const isApproval = member.role.includes("Approval") || member.role.includes("Human");
      const isReviewer = member.role.includes("QA") || member.role.includes("Review");

      return {
        nodeId: asWorkflowNodeId(this.createId(`wn_${i}`)),
        kind: isApproval ? "approval_gate" : isReviewer ? "checkpoint" : "execution",
        name: member.role,
        stage,
        stageOrder: STAGE_ORDER[stage],
        agentRole: member.role,
        agentId: String(member.agentId),
        taskNodeIds: member.taskNodeIds.map(String),
        produces: arts.produces,
        consumes: arts.consumes,
        optional: false,
        blocking: isApproval || isReviewer,
      };
    });

    const edges = buildEdges(nodes, teamPlan, this.createId);
    const parallelGroups = buildParallelGroups(nodes, teamPlan);

    const sorted = [...nodes].sort((a, b) => a.stageOrder - b.stageOrder);

    return success({
      graphId: asWorkflowGraphId(this.createId("wg")),
      nodes,
      edges,
      parallelGroups,
      conditionalGroups: [],
      rootNodes: sorted.filter((n) => n.stageOrder === 1).map((n) => n.nodeId),
      leafNodes: sorted.filter((n) => n.kind === "approval_gate").map((n) => n.nodeId),
    });
  }
}

function buildEdges(
  nodes: WorkflowNode[],
  teamPlan: ExecutionTeamPlan,
  createId: (p: string) => string
): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  const sorted = [...nodes].sort((a, b) => a.stageOrder - b.stageOrder);

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (from.kind === "approval_gate" && to.kind === "approval_gate") continue;

    const depKind = to.blocking ? "blocking" : from.stage === to.stage ? "soft" : "hard";
    edges.push({
      edgeId: asWorkflowEdgeId(createId(`we_${i}`)),
      from: from.nodeId,
      to: to.nodeId,
      dependencyKind: to.kind === "approval_gate" ? "approval" : depKind as never,
      consumes: to.consumes,
      produces: from.produces,
      rationale: `${from.name} produces artifacts consumed by ${to.name}`,
    });
  }

  // Mirror agent graph edges
  for (const ae of teamPlan.agentGraph.edges) {
    const fromNode = nodes.find((n) => n.agentId === String(ae.from));
    const toNode = nodes.find((n) => n.agentId === String(ae.to));
    if (!fromNode || !toNode) continue;
    if (edges.some((e) => e.from === fromNode.nodeId && e.to === toNode.nodeId)) continue;
    edges.push({
      edgeId: asWorkflowEdgeId(createId("we_ag")),
      from: fromNode.nodeId,
      to: toNode.nodeId,
      dependencyKind: "artifact",
      consumes: toNode.consumes,
      produces: fromNode.produces,
      rationale: ae.rationale,
    });
  }

  return edges;
}

function buildParallelGroups(
  nodes: WorkflowNode[],
  teamPlan: ExecutionTeamPlan
): import("../contracts/graph").ParallelExecutionGroup[] {
  const groups: import("../contracts/graph").ParallelExecutionGroup[] = [];

  for (let i = 0; i < teamPlan.parallelGroups.length; i++) {
    const agentIds = teamPlan.parallelGroups[i];
    const groupNodes = nodes.filter((n) => agentIds.includes(n.agentId as never));
    if (groupNodes.length < 2) continue;

    const mergeNode = nodes.find((n) => n.stageOrder > Math.max(...groupNodes.map((g) => g.stageOrder)));
    groups.push({
      groupId: `pg_${i}`,
      nodeIds: groupNodes.map((n) => n.nodeId),
      maxConcurrency: groupNodes.length,
      synchronizationPoint: groupNodes[groupNodes.length - 1].nodeId,
      mergePoint: mergeNode?.nodeId ?? groupNodes[0].nodeId,
    });
  }

  return groups;
}
