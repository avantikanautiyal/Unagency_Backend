/**
 * Agent collaboration graph contracts.
 */

import type { AgentGraphId, AgentId } from "./identifiers";
import type { TaskNodeId } from "../../task-intelligence/contracts/identifiers";

export interface AgentNode {
  readonly agentId: AgentId;
  readonly role: string;
  readonly department: string;
  readonly taskNodeIds: readonly TaskNodeId[];
  readonly stage: number;
  readonly parallelGroup?: string;
  readonly isReviewer: boolean;
  readonly isSupervisor: boolean;
  readonly isHumanGate: boolean;
}

export interface AgentEdge {
  readonly from: AgentId;
  readonly to: AgentId;
  readonly artifactType: string;
  readonly rationale: string;
}

export interface AgentGraph {
  readonly graphId: AgentGraphId;
  readonly teamName: string;
  readonly nodes: readonly AgentNode[];
  readonly edges: readonly AgentEdge[];
  readonly rootAgents: readonly AgentId[];
  readonly leafAgents: readonly AgentId[];
  readonly humanApprovalRequired: boolean;
}
