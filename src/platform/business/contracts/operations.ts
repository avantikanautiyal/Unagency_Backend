/**
 * Workflows, executions, approvals, collaboration.
 */

import type {
  ApprovalStatus,
  BusinessExecutionStatus,
  ActivityKind,
} from "./enums";

/** Business workflow definition — references Intelligence workflow ids, does not replace them. */
export interface BusinessWorkflow {
  readonly workflowId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly name: string;
  readonly description: string;
  /** Opaque reference into Workflow Intelligence (never executed here). */
  readonly intelligenceWorkflowRef: string;
  readonly templateId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BusinessExecutionRecord {
  readonly businessExecutionId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly campaignId?: string;
  readonly brandId?: string;
  readonly workflowId?: string;
  readonly requestedByUserId: string;
  readonly prompt: string;
  readonly status: BusinessExecutionStatus;
  /** Gateway execution id — AI path goes only through Enterprise API. */
  readonly gatewayExecutionId?: string;
  readonly correlationId?: string;
  readonly outputs?: Readonly<Record<string, unknown>>;
  readonly evaluationScore?: number;
  readonly cost?: number;
  readonly experienceRefs: readonly string[];
  readonly auditMeta: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly organizationId: string;
  readonly resourceType: "campaign" | "execution" | "asset" | "document";
  readonly resourceId: string;
  readonly requestedByUserId: string;
  readonly assigneeUserId: string;
  readonly status: ApprovalStatus;
  readonly note?: string;
  readonly decidedAt?: string;
  readonly createdAt: string;
}

export interface Comment {
  readonly commentId: string;
  readonly organizationId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly mentionUserIds: readonly string[];
  readonly createdAt: string;
}

export interface Assignment {
  readonly assignmentId: string;
  readonly organizationId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly assigneeUserId: string;
  readonly assignedByUserId: string;
  readonly createdAt: string;
}

export interface ActivityEvent {
  readonly activityId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly kind: ActivityKind;
  readonly actorUserId: string;
  readonly message: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly createdAt: string;
}

export interface Notification {
  readonly notificationId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: string;
}
