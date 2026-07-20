/**
 * Organization / workspace / project / team contracts.
 */

import type { BusinessRole, InvitationStatus } from "./enums";

export interface Organization {
  readonly organizationId: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly status: "active" | "suspended";
}

export interface Department {
  readonly departmentId: string;
  readonly organizationId: string;
  readonly name: string;
}

export interface Team {
  readonly teamId: string;
  readonly organizationId: string;
  readonly departmentId?: string;
  readonly name: string;
  readonly memberUserIds: readonly string[];
}

export interface Workspace {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Project {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly brandId?: string;
  readonly createdAt: string;
}

export interface BusinessUser {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly BusinessRole[];
  readonly createdAt: string;
}

export interface Invitation {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly roles: readonly BusinessRole[];
  readonly invitedByUserId: string;
  readonly status: InvitationStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface Membership {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly roles: readonly BusinessRole[];
}
