import type {
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type ActorType = "user" | "staff" | "system" | "agent" | "integration";

export interface SecurityContext {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly actorId?: UserId;
  readonly actorType: ActorType;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly correlationId?: string;
}

export interface AuthorizationRequest {
  readonly context: SecurityContext;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
}

export interface AuthorizationResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export type DataClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "pii";

export interface AuditEvent {
  readonly id?: string;
  readonly action: string;
  readonly context: SecurityContext;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly outcome: "allowed" | "denied" | "success" | "failure";
  readonly occurredAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
