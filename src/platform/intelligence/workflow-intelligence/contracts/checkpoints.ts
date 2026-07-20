/**
 * Checkpoint contracts.
 */

import type { CheckpointId, WorkflowNodeId } from "./identifiers";
import type { CheckpointKind } from "./enums";

export interface ExecutionCheckpoint {
  readonly checkpointId: CheckpointId;
  readonly kind: CheckpointKind;
  readonly name: string;
  readonly nodeId: WorkflowNodeId;
  readonly saveState: boolean;
  readonly recoverable: boolean;
  readonly rationale: string;
}

export interface CheckpointPlan {
  readonly planId: string;
  readonly checkpoints: readonly ExecutionCheckpoint[];
  readonly rationale: string;
}
