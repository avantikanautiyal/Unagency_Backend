/**
 * Workflow versioning and lifecycle contracts.
 */

import type { WorkflowLifecycleState, WorkflowVersionKind } from "./enums";

export interface WorkflowVersion {
  readonly version: string;
  readonly kind: WorkflowVersionKind;
  readonly revision: number;
  readonly parentWorkflowId?: string;
  readonly derivedFrom?: string;
  readonly createdAt: string;
}

export interface WorkflowManifest {
  readonly manifestId: string;
  readonly name: string;
  readonly version: WorkflowVersion;
  readonly lifecycle: WorkflowLifecycleState;
  readonly nodeCount: number;
  readonly stageCount: number;
  readonly snapshot: boolean;
}

export interface WorkflowSnapshot {
  readonly snapshotId: string;
  readonly workflowPlanId: string;
  readonly version: WorkflowVersion;
  readonly capturedAt: string;
}
