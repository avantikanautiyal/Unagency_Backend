/**
 * Workflow graph contracts.
 */

import type { WorkflowGraphId, WorkflowNodeId, WorkflowEdgeId } from "./identifiers";
import type { WorkflowNodeKind, WorkflowStageKind, DependencyKind, ArtifactFlowKind } from "./enums";

export interface WorkflowNode {
  readonly nodeId: WorkflowNodeId;
  readonly kind: WorkflowNodeKind;
  readonly name: string;
  readonly stage: WorkflowStageKind;
  readonly stageOrder: number;
  readonly agentRole?: string;
  readonly agentId?: string;
  readonly taskNodeIds: readonly string[];
  readonly produces: readonly ArtifactFlowKind[];
  readonly consumes: readonly ArtifactFlowKind[];
  readonly optional: boolean;
  readonly blocking: boolean;
}

export interface WorkflowEdge {
  readonly edgeId: WorkflowEdgeId;
  readonly from: WorkflowNodeId;
  readonly to: WorkflowNodeId;
  readonly dependencyKind: DependencyKind;
  readonly consumes: readonly ArtifactFlowKind[];
  readonly produces: readonly ArtifactFlowKind[];
  readonly rationale: string;
}

export interface ParallelExecutionGroup {
  readonly groupId: string;
  readonly nodeIds: readonly WorkflowNodeId[];
  readonly maxConcurrency: number;
  readonly synchronizationPoint: WorkflowNodeId;
  readonly mergePoint: WorkflowNodeId;
}

export interface ConditionalGroup {
  readonly groupId: string;
  readonly condition: string;
  readonly branchKind: import("./enums").ConditionalBranchKind;
  readonly trueBranch: readonly WorkflowNodeId[];
  readonly falseBranch?: readonly WorkflowNodeId[];
}

export interface ExecutionWorkflowGraph {
  readonly graphId: WorkflowGraphId;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly parallelGroups: readonly ParallelExecutionGroup[];
  readonly conditionalGroups: readonly ConditionalGroup[];
  readonly rootNodes: readonly WorkflowNodeId[];
  readonly leafNodes: readonly WorkflowNodeId[];
}
