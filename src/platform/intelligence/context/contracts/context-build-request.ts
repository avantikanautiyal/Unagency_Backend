/**
 * Input for context construction.
 * Accepts capability/gateway-aligned request fields without depending on gateway implementation.
 */

import type {
  CapabilityId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";
import type { ExecutionPriority } from "../../execution-planning/contracts/execution-priority";

export interface ContextBuildRequest {
  readonly capabilityId: CapabilityId | string;
  readonly organizationId: OrganizationId | string;
  readonly workspaceId: WorkspaceId | string;
  readonly capabilityVersion?: string;
  readonly userId?: UserId | string;
  readonly actorType?: "user" | "staff" | "system" | "agent" | "integration";
  readonly projectId?: string;
  readonly requirementId?: string;
  readonly taskId?: string;
  readonly inputHints?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly priority?: ExecutionPriority;
  readonly language?: string;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
