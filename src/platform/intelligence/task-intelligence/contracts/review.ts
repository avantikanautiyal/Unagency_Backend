/**
 * Review plan contracts.
 */

import type { TaskNodeId } from "./identifiers";
import type { GateKind } from "./enums";

export interface ReviewCheckpoint {
  readonly checkpointId: string;
  readonly nodeId: TaskNodeId;
  readonly gate: GateKind;
  readonly description: string;
  readonly required: boolean;
  readonly rationale: string;
}

export interface ReviewPlan {
  readonly planId: string;
  readonly checkpoints: readonly ReviewCheckpoint[];
  readonly humanReviewRequired: boolean;
  readonly approvalRequired: boolean;
  readonly rationale: string;
}
