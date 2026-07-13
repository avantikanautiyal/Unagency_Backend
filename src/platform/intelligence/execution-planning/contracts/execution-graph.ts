/**
 * Execution graph model.
 *
 * Purpose: Represent planned work as nodes and edges.
 * Responsibilities: Immutable graph structure for future orchestrator.
 * Usage: Embedded in ExecutionPlan.
 * Future Extension: Conditional branches, fan-out/fan-in.
 */

import type { ProviderId } from "../../shared/identifiers";
import type { ExecutionMode } from "./execution-mode";

export type ExecutionNodeKind =
  | "capability"
  | "provider"
  | "human_review"
  | "evaluation"
  | "gate";

export interface ExecutionNode {
  readonly id: string;
  readonly kind: ExecutionNodeKind;
  readonly label: string;
  readonly providerId?: ProviderId;
  readonly stageId: string;
  readonly order: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ExecutionEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly condition?: string;
}

export interface ExecutionStage {
  readonly id: string;
  readonly name: string;
  readonly mode: ExecutionMode;
  readonly order: number;
  readonly nodeIds: readonly string[];
}

export interface ExecutionGraph {
  readonly entryNodeId: string;
  readonly exitNodeId: string;
  readonly nodes: readonly ExecutionNode[];
  readonly edges: readonly ExecutionEdge[];
  readonly stages: readonly ExecutionStage[];
}
