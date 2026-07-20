/**
 * Workflow stage contracts.
 */

import type { WorkflowNodeId } from "./identifiers";
import type { WorkflowStageKind } from "./enums";

export interface WorkflowStage {
  readonly stageId: string;
  readonly kind: WorkflowStageKind;
  readonly name: string;
  readonly order: number;
  readonly nodeIds: readonly WorkflowNodeId[];
  readonly parallel: boolean;
  readonly estimatedDurationMinutes: number;
  readonly rationale: string;
}
