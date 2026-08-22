/**
 * M10.19 — Collaboration domain types.
 * UNAGENCY owns channel identity/permissions; Socket.IO is first-party transport.
 */

export type CollaborationEntityKind =
  | "organization"
  | "general"
  | "project"
  | "brand"
  | "campaign"
  | "brief"
  | "execution"
  | "support"
  | "team"
  | "client"
  | "ai_discussion"
  | "rm";

export type CollaborationMemberRole =
  | "owner"
  | "admin"
  | "manager"
  | "designer"
  | "developer"
  | "client"
  | "viewer"
  | "reviewer"
  | "approver"
  | "member";

export type CollaborationMessageType =
  | "text"
  | "image"
  | "video"
  | "voice"
  | "document"
  | "brand_asset"
  | "execution_artifact"
  | "knowledge_document"
  | "task"
  | "approval_request"
  | "notification"
  | "execution_result"
  | "ai_response"
  | "system";

/** Stable Stream channel id — never a random public room. */
export function buildChannelId(
  kind: CollaborationEntityKind,
  entityId: string
): string {
  const safe = String(entityId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return `${kind}_${safe}`.slice(0, 64);
}

export function mapLegacyRoleToCollaborationRole(
  legacyRole?: string
): CollaborationMemberRole {
  switch ((legacyRole || "").toLowerCase()) {
    case "superadmin":
    case "admin":
      return "admin";
    case "servicing":
      return "manager";
    case "resource":
      return "designer";
    case "customer":
      return "client";
    case "owner":
      return "owner";
    case "viewer":
      return "viewer";
    case "reviewer":
      return "reviewer";
    case "approver":
      return "approver";
    default:
      return "member";
  }
}

export type CollaborationChannelDto = {
  channelId: string;
  cid: string;
  name: string;
  entityKind: CollaborationEntityKind;
  entityId: string;
  organizationId?: string;
  projectId?: string;
  brandId?: string;
  briefId?: string;
  executionId?: string;
  unreadCount?: number;
  lastMessagePreview?: string;
  memberRole?: CollaborationMemberRole;
};

export type CollaborationMemberDto = {
  userId: string;
  role: CollaborationMemberRole;
  name?: string;
  email?: string;
  image?: string;
};

export type CollaborationMessageDto = {
  id: string;
  channelId: string;
  text: string;
  messageType: CollaborationMessageType;
  fromUserId?: string;
  createdAt: string;
  parentId?: string;
  threadId?: string;
  assetId?: string;
  artifactId?: string;
  executionId?: string;
  approvalId?: string;
  metadata?: Record<string, unknown>;
  status?: "sending" | "sent" | "failed";
};
