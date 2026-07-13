/**
 * Runtime context for an execution session.
 */

import type {
  ExecutionId,
  OrganizationId,
  WorkspaceId,
} from "../../shared/identifiers";

export interface ExecutionRuntimeContext {
  readonly executionId: ExecutionId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly correlationId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
