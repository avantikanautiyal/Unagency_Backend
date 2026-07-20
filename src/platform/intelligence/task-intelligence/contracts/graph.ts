/**
 * Task graph and dependency DAG contracts.
 */

import type { TaskGraphId, TaskNodeId } from "./identifiers";
import type { DependencyKind, GateKind } from "./enums";
import type { TaskNode } from "./task";

export interface DependencyEdge {
  readonly from: TaskNodeId;
  readonly to: TaskNodeId;
  readonly kind: DependencyKind;
  readonly gate?: GateKind;
  readonly rationale: string;
}

export interface DependencyGraph {
  readonly graphId: TaskGraphId;
  readonly nodes: readonly TaskNodeId[];
  readonly edges: readonly DependencyEdge[];
  readonly sequentialChains: readonly (readonly TaskNodeId[])[];
  readonly parallelGroups: readonly (readonly TaskNodeId[])[];
  readonly blockingNodes: readonly TaskNodeId[];
  readonly optionalNodes: readonly TaskNodeId[];
  readonly gateNodes: readonly TaskNodeId[];
}

export interface TaskGraph {
  readonly graphId: TaskGraphId;
  readonly nodes: readonly TaskNode[];
  readonly dependencyGraph: DependencyGraph;
  readonly rootNodes: readonly TaskNodeId[];
  readonly leafNodes: readonly TaskNodeId[];
}
