/**
 * Approval gate contracts.
 */

import type { WorkflowNodeId } from "./identifiers";
import type { ApprovalGateKind, ArtifactFlowKind } from "./enums";

export interface ApprovalGate {
  readonly gateId: string;
  readonly kind: ApprovalGateKind;
  readonly name: string;
  readonly nodeId: WorkflowNodeId;
  readonly inputs: readonly ArtifactFlowKind[];
  readonly outputs: readonly ArtifactFlowKind[];
  readonly requiredArtifacts: readonly string[];
  readonly blocking: boolean;
  readonly rationale: string;
}

export interface ApprovalPlan {
  readonly planId: string;
  readonly gates: readonly ApprovalGate[];
  readonly finalHumanApproval: boolean;
  readonly rationale: string;
}
