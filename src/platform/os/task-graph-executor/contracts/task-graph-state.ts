/**
 * Phase 5 — Task graph run / task node state contracts.
 */

export const TASK_GRAPH_RUNTIME_VERSION = "phase5.1" as const;

export type TaskNodeStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED"
  | "BLOCKED"
  | "SKIPPED";

export type TaskGraphExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIALLY_SUCCEEDED"
  | "CANCELLED"
  | "BLOCKED";

/** Phase 6 — business approval distinct from technical task success */
export type ExecutionApprovalStatus =
  | "NOT_EVALUATED"
  | "APPROVED"
  | "BLOCKED"
  | "REJECTED"
  | "HUMAN_REVIEW"
  | "PENDING";

export type TaskFailureClass =
  | "transient"
  | "timeout"
  | "provider"
  | "validation"
  | "fatal"
  | "contract"
  | "tenant"
  | "capability"
  | "cancelled"
  | "dependency";

export interface TaskOutputReference {
  readonly outputRefId: string;
  readonly taskId: string;
  readonly executionId: string;
  readonly outputContractId: string;
  readonly preview?: string;
  readonly artifactIds?: readonly string[];
  readonly createdAt: string;
}

export interface TaskAttemptRecord {
  readonly attempt: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: TaskNodeStatus;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly failureClass?: TaskFailureClass;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface TaskNodeState {
  readonly taskId: string;
  readonly taskKey: string;
  readonly status: TaskNodeStatus;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly claimedBy?: string;
  readonly claimToken?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly outputRef?: TaskOutputReference;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly failureClass?: TaskFailureClass;
  readonly blockedByTaskIds?: readonly string[];
  readonly attempts: readonly TaskAttemptRecord[];
  readonly updatedAt: string;
  /** Phase 8 — runtime concern, not a provider detail. */
  readonly executionMode?: "SYNC" | "ASYNC";
  readonly heartbeatAt?: string;
  readonly externalJobRef?: string;
}

export interface TaskGraphRunSnapshot {
  readonly runId: string;
  readonly runtimeVersion: typeof TASK_GRAPH_RUNTIME_VERSION;
  readonly executionId: string;
  readonly organizationId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly status: TaskGraphExecutionStatus;
  readonly tasks: readonly TaskNodeState[];
  readonly parallelEligibleTaskIds: readonly string[];
  readonly maxConcurrency: number;
  readonly cancelRequested: boolean;
  readonly cancelReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly stateVersion: number;
  readonly events: readonly TaskGraphEvent[];
  /** Phase 6 — technical success ≠ business approval */
  readonly approvalStatus?: ExecutionApprovalStatus;
  readonly lastGovernanceAction?: string;
  readonly lastGovernanceDecisionId?: string;
}

export interface TaskGraphEvent {
  readonly at: string;
  readonly type: string;
  readonly taskId?: string;
  readonly detail?: string;
}

/** Allowed task status transitions. */
export const TASK_STATUS_TRANSITIONS: Readonly<
  Record<TaskNodeStatus, readonly TaskNodeStatus[]>
> = {
  PENDING: ["READY", "BLOCKED", "SKIPPED", "CANCELLED"],
  READY: ["RUNNING", "BLOCKED", "SKIPPED", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  FAILED: ["RETRYING", "BLOCKED", "SKIPPED"],
  RETRYING: ["READY", "RUNNING", "CANCELLED", "FAILED"],
  SUCCEEDED: ["RETRYING"],
  CANCELLED: [],
  BLOCKED: ["CANCELLED", "SKIPPED"],
  SKIPPED: [],
};

export function canTransitionTaskStatus(
  from: TaskNodeStatus,
  to: TaskNodeStatus
): boolean {
  if (from === to) return true;
  return (TASK_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
