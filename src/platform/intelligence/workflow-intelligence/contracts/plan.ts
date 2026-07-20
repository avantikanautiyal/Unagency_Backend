/**
 * Workflow execution plan — primary output.
 */

import type { WorkflowPlanId } from "./identifiers";
import type { ExecutionWorkflowGraph } from "./graph";
import type { WorkflowStage } from "./stages";
import type { ApprovalPlan } from "./approvals";
import type { CheckpointPlan } from "./checkpoints";
import type { RollbackPlan, RecoveryPlan, ResumePlan } from "./recovery";
import type { WorkflowManifest } from "./versioning";

export interface WorkflowExecutionPlan {
  readonly planId: WorkflowPlanId;
  readonly name: string;
  readonly graph: ExecutionWorkflowGraph;
  readonly stages: readonly WorkflowStage[];
  readonly approvalPlan: ApprovalPlan;
  readonly checkpointPlan: CheckpointPlan;
  readonly rollbackPlan: RollbackPlan;
  readonly recoveryPlan: RecoveryPlan;
  readonly resumePlan: ResumePlan;
  readonly manifest: WorkflowManifest;
  readonly version: string;
  readonly createdAt: string;
}
