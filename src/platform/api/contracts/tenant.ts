/**
 * Multi-tenant contracts.
 */

import type { RoleName } from "./enums";

export interface OrganizationRecord {
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
  readonly status: "active" | "suspended";
}

export interface DepartmentRecord {
  readonly departmentId: string;
  readonly organizationId: string;
  readonly name: string;
}

export interface TeamRecord {
  readonly teamId: string;
  readonly organizationId: string;
  readonly departmentId?: string;
  readonly name: string;
}

export interface WorkspaceRecord {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface ProjectRecord {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
}

export interface UserRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly roles: readonly RoleName[];
  readonly createdAt: string;
}

export interface MembershipRecord {
  readonly membershipId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly roles: readonly RoleName[];
}

export interface TenantContext {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly departmentId?: string;
  readonly teamId?: string;
  readonly projectId?: string;
  readonly userId?: string;
}
