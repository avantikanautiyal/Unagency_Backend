/**
 * Identity and scope contracts for context construction.
 */

import type {
  CapabilityId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export interface ContextIdentity {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: UserId;
  readonly actorType?: "user" | "staff" | "system" | "agent" | "integration";
  readonly correlationId?: string;
  readonly requestId?: string;
}

export interface ContextScope {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: string;
  readonly requirementId?: string;
  readonly taskId?: string;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion?: string;
}

export type ContextSourceKind =
  | "request"
  | "organization"
  | "workspace"
  | "project"
  | "requirement"
  | "task"
  | "user"
  | "role"
  | "capability"
  | "execution"
  | "brand"
  | "asset"
  | "policy"
  | "security"
  | "language"
  | "locale"
  | "timezone"
  | "platform";

export interface ContextSource {
  readonly kind: ContextSourceKind;
  readonly sourceId?: string;
  readonly resolvedAt: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
