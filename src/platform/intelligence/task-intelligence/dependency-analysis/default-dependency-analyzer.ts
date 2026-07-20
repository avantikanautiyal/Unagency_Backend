/**
 * Dependency analyzer — builds DAG from task nodes.
 */

import { success, type Result } from "../../shared/result";
import { asTaskGraphId } from "../contracts/identifiers";
import type { TaskNode } from "../contracts/task";
import type { DependencyEdge, DependencyGraph } from "../contracts/graph";
import type { IDependencyAnalyzer } from "../interfaces/task-intelligence";

export class DefaultDependencyAnalyzer implements IDependencyAnalyzer {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`
  ) {}

  analyze(nodes: readonly TaskNode[]): Result<DependencyGraph> {
    const nodeIds = nodes.map((n) => n.nodeId);
    const edges: DependencyEdge[] = [];

    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        edges.push({
          from: dep,
          to: node.nodeId,
          kind: node.optional ? "optional" : node.parallelGroup ? "parallel" : "sequential",
          gate: node.nodeKind === "review_gate" ? "human_review" : node.nodeKind === "approval_gate" ? "approval" : undefined,
          rationale: `${node.title} depends on upstream completion`,
        });
      }
    }

    const parallelGroups = groupByParallel(nodes);
    const sequentialChains = buildSequentialChains(nodes, edges);
    const blockingNodes = nodes.filter((n) => !n.optional && n.stage <= 2).map((n) => n.nodeId);
    const optionalNodes = nodes.filter((n) => n.optional).map((n) => n.nodeId);
    const gateNodes = nodes.filter((n) => n.nodeKind !== "task").map((n) => n.nodeId);

    return success({
      graphId: asTaskGraphId(this.createId("dag")),
      nodes: nodeIds,
      edges,
      sequentialChains,
      parallelGroups,
      blockingNodes,
      optionalNodes,
      gateNodes,
    });
  }
}

function groupByParallel(nodes: readonly TaskNode[]): (readonly import("../contracts/identifiers").TaskNodeId[])[] {
  const groups = new Map<string, import("../contracts/identifiers").TaskNodeId[]>();
  for (const n of nodes) {
    if (!n.parallelGroup) continue;
    const list = groups.get(n.parallelGroup) ?? [];
    list.push(n.nodeId);
    groups.set(n.parallelGroup, list);
  }
  return [...groups.values()];
}

function buildSequentialChains(
  nodes: readonly TaskNode[],
  edges: readonly DependencyEdge[]
): (readonly import("../contracts/identifiers").TaskNodeId[])[] {
  const roots = nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.nodeId);
  if (roots.length === 0) return [];
  const chain: import("../contracts/identifiers").TaskNodeId[] = [...roots];
  let current = roots[roots.length - 1];
  for (let i = 0; i < 5; i++) {
    const next = edges.find((e) => e.from === current && e.kind === "sequential");
    if (!next) break;
    chain.push(next.to);
    current = next.to;
  }
  return [chain];
}
