/**
 * Workflow planner — assembles StructuredTaskPlan and TaskExecutionPlan.
 */

import { success, type Result } from "../../shared/result";
import { asTaskGraphId } from "../contracts/identifiers";
import type { CapabilityMap } from "../contracts/capability";
import type { DeliverablePlan } from "../contracts/deliverable";
import type { DependencyGraph, TaskGraph } from "../contracts/graph";
import type { ComplexityProfile } from "../contracts/complexity";
import type { ExecutionConstraintProfile } from "../contracts/constraints";
import type { ReviewPlan } from "../contracts/review";
import type { TaskNode } from "../contracts/task";
import type { ExecutionStage, StructuredTaskPlan, TaskExecutionPlan } from "../contracts/planning";
import type { IWorkflowPlanner } from "../interfaces/task-intelligence";
import { TASK_INTELLIGENCE_VERSION } from "../constants";

export class DefaultWorkflowPlanner implements IWorkflowPlanner {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  plan(
    nodes: readonly TaskNode[],
    dependencyGraph: DependencyGraph,
    capabilityMap: CapabilityMap,
    deliverablePlan: DeliverablePlan,
    constraints: ExecutionConstraintProfile,
    reviewPlan: ReviewPlan,
    complexity: ComplexityProfile
  ): Result<{ structuredTaskPlan: StructuredTaskPlan; taskExecutionPlan: TaskExecutionPlan }> {
    const stages = buildStages(nodes);
    const taskGraph: TaskGraph = {
      graphId: asTaskGraphId(this.createId("tg")),
      nodes,
      dependencyGraph,
      rootNodes: nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.nodeId),
      leafNodes: findLeafNodes(nodes, dependencyGraph),
    };

    const taskExecutionPlan: TaskExecutionPlan = {
      planId: this.createId("tep"),
      orderedTasks: [...nodes].sort((a, b) => a.stage - b.stage || a.title.localeCompare(b.title)),
      parallelGroups: dependencyGraph.parallelGroups,
      dependencies: dependencyGraph,
      stages,
      expectedDeliverables: deliverablePlan.items.map((d) => d.name),
      estimatedComplexity: complexity.tier,
      estimatedDurationMinutes: complexity.estimatedDurationMinutes,
      requiredCapabilities: capabilityMap.requirements.map((r) => r.capabilityId),
      reviewCheckpoints: reviewPlan.checkpoints.map((c) => c.checkpointId),
      rationale: "Workflow assembled from task graph and dependency analysis",
    };

    const structuredTaskPlan: StructuredTaskPlan = {
      planId: this.createId("stp"),
      taskGraph,
      executionStages: stages,
      capabilityRequirements: capabilityMap,
      dependencyGraph,
      deliverablePlan,
      executionConstraints: constraints,
      reviewPlan,
      taskExecutionPlan,
      version: TASK_INTELLIGENCE_VERSION,
      createdAt: this.nowIso(),
    };

    return success({ structuredTaskPlan, taskExecutionPlan });
  }
}

function buildStages(nodes: readonly TaskNode[]): ExecutionStage[] {
  const stageMap = new Map<number, TaskNode[]>();
  for (const n of nodes) {
    const list = stageMap.get(n.stage) ?? [];
    list.push(n);
    stageMap.set(n.stage, list);
  }
  return [...stageMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stage, stageNodes]) => ({
      stage,
      name: `Stage ${stage}`,
      nodeIds: stageNodes.map((n) => n.nodeId),
      parallel: stageNodes.some((n) => !!n.parallelGroup),
    }));
}

function findLeafNodes(
  nodes: readonly TaskNode[],
  graph: DependencyGraph
): import("../contracts/identifiers").TaskNodeId[] {
  const hasOutgoing = new Set(graph.edges.map((e) => e.from));
  return nodes.filter((n) => !hasOutgoing.has(n.nodeId)).map((n) => n.nodeId);
}
