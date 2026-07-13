/**
 * Execution graph integrity checks.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ExecutionGraph } from "../contracts/execution-graph";
import type { ExecutionPlan } from "../contracts/execution-plan";
import { PlanningValidationError } from "../errors";

export function validateExecutionGraph(
  graph: ExecutionGraph
): Result<ExecutionGraph> {
  const issues: string[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  if (!nodeIds.has(graph.entryNodeId)) {
    issues.push("entryNodeId missing from nodes");
  }
  if (!nodeIds.has(graph.exitNodeId)) {
    issues.push("exitNodeId missing from nodes");
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      issues.push(`edge ${edge.id} references unknown node`);
    }
  }

  for (const stage of graph.stages) {
    for (const nodeId of stage.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        issues.push(`stage ${stage.id} references unknown node ${nodeId}`);
      }
    }
  }

  const orders = graph.stages.map((s) => s.order);
  const sorted = [...orders].sort((a, b) => a - b);
  if (orders.join(",") !== sorted.join(",")) {
    issues.push("stages are not ordered by order field");
  }

  // Reachability from entry
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, list);
  }

  const visited = new Set<string>();
  const stack = [graph.entryNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  if (!visited.has(graph.exitNodeId)) {
    issues.push("exitNodeId is not reachable from entryNodeId");
  }

  if (issues.length > 0) {
    return failure(
      new PlanningValidationError("Execution graph integrity check failed", {
        issues,
      })
    );
  }

  return success(graph);
}

export function validateExecutionPlan(
  plan: ExecutionPlan
): Result<ExecutionPlan> {
  const graphResult = validateExecutionGraph(plan.graph);
  if (!graphResult.ok) {
    return graphResult;
  }

  if (!plan.planId) {
    return failure(
      new PlanningValidationError("planId is required")
    );
  }

  if (
    String(plan.providerSelection.primaryProviderId) !==
    String(plan.metadata.primaryProviderId)
  ) {
    return failure(
      new PlanningValidationError(
        "providerSelection and metadata primary provider mismatch"
      )
    );
  }

  return success(plan);
}

export function stageOrder(plan: ExecutionPlan): readonly string[] {
  return [...plan.graph.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => stage.id);
}
