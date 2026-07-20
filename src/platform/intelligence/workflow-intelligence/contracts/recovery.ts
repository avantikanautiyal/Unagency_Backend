/**
 * Rollback, recovery, and resume contracts.
 */

import type { WorkflowNodeId } from "./identifiers";
import type { RecoveryActionKind } from "./enums";

export interface RollbackStep {
  readonly stepId: string;
  readonly fromNodeId: WorkflowNodeId;
  readonly toNodeId: WorkflowNodeId;
  readonly scope: string;
  readonly order: number;
  readonly condition: string;
}

export interface RollbackPlan {
  readonly planId: string;
  readonly steps: readonly RollbackStep[];
  readonly rollbackGraph: readonly WorkflowNodeId[];
  readonly conditions: readonly string[];
  readonly scope: string;
  readonly rationale: string;
}

export interface RecoveryAction {
  readonly actionId: string;
  readonly kind: RecoveryActionKind;
  readonly targetNodeId: WorkflowNodeId;
  readonly maxRetries: number;
  readonly escalateTo?: string;
  readonly rationale: string;
}

export interface RecoveryPlan {
  readonly planId: string;
  readonly actions: readonly RecoveryAction[];
  readonly defaultAction: RecoveryActionKind;
  readonly rationale: string;
}

export interface ResumeCheckpoint {
  readonly checkpointId: string;
  readonly nodeId: WorkflowNodeId;
  readonly artifactRecovery: readonly string[];
}

export interface ResumePlan {
  readonly planId: string;
  readonly checkpoints: readonly ResumeCheckpoint[];
  readonly restartNodeId?: WorkflowNodeId;
  readonly continuationStrategy: string;
  readonly rationale: string;
}
