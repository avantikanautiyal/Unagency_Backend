/**
 * Collaboration: comments, presence, approvals, notifications.
 */

import type { StudioApprovalStatus, StudioPresenceStatus } from "./enums";

export interface StudioComment {
  readonly commentId: string;
  readonly workspaceId: string;
  readonly authorId: string;
  readonly body: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly mentionUserIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioPresence {
  readonly presenceId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly status: StudioPresenceStatus;
  readonly viewId?: string;
  readonly cursor?: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}

export interface StudioApprovalRequest {
  readonly approvalId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly requesterId: string;
  readonly reviewerIds: readonly string[];
  readonly status: StudioApprovalStatus;
  readonly targetKind: string;
  readonly targetId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioNotification {
  readonly notificationId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: string;
}
