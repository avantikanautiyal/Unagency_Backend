/**
 * Current authenticated principal (GET /v1/me) — M10.2.
 * Server-authoritative memberships + roles. Safe fields only.
 */

import Teams from "../../../models/team.model";
import Organizations from "../../../models/organization.model";
import Users from "../../../models/users.model";
import { failure, success, type Result } from "../../core/result";
import { AuthorizationError, ValidationError } from "../../core/errors";
import type { AuthPrincipal, Permission, RoleName } from "../contracts";
import { permissionsForRoles } from "../authorization/rbac";
import { mapLegacyRoleToPlatformRoles } from "../auth/firebase/role-permission-mapper";
import type { ITenantService } from "../interfaces";
import { isFirebaseAuthenticatedPrincipal } from "../auth/firebase/firebase-authentication-adapter";

export type CurrentPrincipalMembership = {
  readonly organizationId: string;
  readonly organizationName?: string;
  readonly source: "owner" | "team";
  readonly teamRole?: "owner" | "member";
  readonly roles: readonly RoleName[];
};

export type CurrentPrincipalWorkspace = {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
};

export type CurrentPrincipalResponse = {
  readonly user: {
    readonly id: string;
    readonly firebaseUid?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly phoneNumber?: string;
    readonly legacyRole?: string;
  };
  readonly roles: readonly RoleName[];
  readonly permissions: readonly Permission[];
  readonly memberships: readonly CurrentPrincipalMembership[];
  readonly currentOrganizationId?: string;
  readonly workspaces: readonly CurrentPrincipalWorkspace[];
  readonly onboarding: {
    readonly needsOrganization: boolean;
  };
};

export interface CurrentPrincipalServiceDeps {
  readonly tenants?: ITenantService;
}

function firebaseUidFromPrincipal(principal: AuthPrincipal): string | undefined {
  if (!principal.sessionId?.startsWith("firebase_")) return undefined;
  return principal.sessionId.slice("firebase_".length);
}

export class CurrentPrincipalService {
  constructor(private readonly deps: CurrentPrincipalServiceDeps = {}) {}

  async getMe(principal: AuthPrincipal | undefined): Promise<Result<CurrentPrincipalResponse>> {
    if (!principal?.userId) {
      return failure(new AuthorizationError("authentication required"));
    }

    const mongoUser = await Users.findById(principal.userId);
    if (!mongoUser) {
      return failure(new ValidationError("user not found"));
    }

    const memberships: CurrentPrincipalMembership[] = [];
    const owned = await Organizations.findOne({ owner: mongoUser._id });
    if (owned) {
      memberships.push({
        organizationId: owned._id.toString(),
        organizationName: owned.companyName,
        source: "owner",
        teamRole: "owner",
        roles: mapLegacyRoleToPlatformRoles(mongoUser.role, {
          isOrganizationOwner: true,
        }),
      });
    }

    const teamRows = await Teams.find({
      userId: mongoUser._id,
      invitationStatus: "accepted",
    });

    for (const row of teamRows) {
      const orgId = row.Organization.toString();
      if (memberships.some((m) => m.organizationId === orgId)) continue;
      const org = await Organizations.findById(row.Organization);
      memberships.push({
        organizationId: orgId,
        organizationName: org?.companyName,
        source: "team",
        teamRole: row.role,
        roles: mapLegacyRoleToPlatformRoles(mongoUser.role, {
          teamRole: row.role,
        }),
      });
    }

    const currentOrganizationId =
      principal.organizationId &&
      memberships.some((m) => m.organizationId === principal.organizationId)
        ? principal.organizationId
        : memberships[0]?.organizationId;

    const workspaces: CurrentPrincipalWorkspace[] = [];
    if (currentOrganizationId && this.deps.tenants?.listWorkspaces) {
      const listed = await this.deps.tenants.listWorkspaces(currentOrganizationId);
      if (listed.ok) {
        for (const ws of listed.value) {
          workspaces.push({
            workspaceId: ws.workspaceId,
            organizationId: ws.organizationId,
            name: ws.name,
          });
        }
      }
    }

    const roles = principal.roles;
    const permissions = permissionsForRoles([...roles]);
    const firebaseUid =
      firebaseUidFromPrincipal(principal) ?? mongoUser.firebaseId;

    return success({
      user: {
        id: mongoUser._id.toString(),
        firebaseUid: isFirebaseAuthenticatedPrincipal(principal)
          ? firebaseUid
          : mongoUser.firebaseId,
        displayName: mongoUser.name,
        email: mongoUser.email,
        phoneNumber:
          typeof mongoUser.contact === "string"
            ? mongoUser.contact
            : mongoUser.contact != null
              ? String(mongoUser.contact)
              : undefined,
        legacyRole: mongoUser.role,
      },
      roles,
      permissions,
      memberships,
      currentOrganizationId,
      workspaces,
      onboarding: {
        needsOrganization: memberships.length === 0,
      },
    });
  }
}
