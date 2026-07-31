/**
 * Centralized legacy Mongo role → platform RoleName → permission mapping.
 *
 * Platform permissions are derived at authorize-time via permissionsForRoles().
 * This module owns the legacy role translation only.
 */

import type { Permission, RoleName } from "../../contracts";
import { permissionsForRoles } from "../../authorization/rbac";

export type LegacyUserRole =
  | "admin"
  | "customer"
  | "superadmin"
  | "resource"
  | "servicing"
  | string;

export interface LegacyRoleMappingContext {
  readonly isOrganizationOwner?: boolean;
  readonly teamRole?: "owner" | "member";
}

/** Platform roles assigned per legacy role (before permission expansion). */
export const LEGACY_ROLE_TO_PLATFORM_ROLES: Readonly<
  Record<string, readonly RoleName[]>
> = {
  superadmin: ["owner"],
  admin: ["admin"],
  servicing: ["admin"],
  resource: ["member"],
  customer_owner: ["owner"],
  customer_member: ["member"],
  unknown: ["viewer"],
};

export function mapLegacyRoleToPlatformRoles(
  legacyRole: LegacyUserRole,
  context: LegacyRoleMappingContext = {}
): readonly RoleName[] {
  switch (legacyRole) {
    case "superadmin":
      return LEGACY_ROLE_TO_PLATFORM_ROLES.superadmin;
    case "admin":
      return LEGACY_ROLE_TO_PLATFORM_ROLES.admin;
    case "servicing":
      return LEGACY_ROLE_TO_PLATFORM_ROLES.servicing;
    case "resource":
      return LEGACY_ROLE_TO_PLATFORM_ROLES.resource;
    case "customer":
      if (context.isOrganizationOwner || context.teamRole === "owner") {
        return LEGACY_ROLE_TO_PLATFORM_ROLES.customer_owner;
      }
      return LEGACY_ROLE_TO_PLATFORM_ROLES.customer_member;
    default:
      return LEGACY_ROLE_TO_PLATFORM_ROLES.unknown;
  }
}

export function permissionsForLegacyRole(
  legacyRole: LegacyUserRole,
  context: LegacyRoleMappingContext = {}
): readonly Permission[] {
  return permissionsForRoles([...mapLegacyRoleToPlatformRoles(legacyRole, context)]);
}

/** Documented matrix for M9.2B — permissions implied by platform roles. */
export function buildLegacyRolePermissionMatrix(): Readonly<
  Record<string, readonly Permission[]>
> {
  const roles: LegacyUserRole[] = [
    "superadmin",
    "admin",
    "servicing",
    "resource",
    "customer",
  ];
  const matrix: Record<string, readonly Permission[]> = {};
  for (const role of roles) {
    matrix[role] = permissionsForLegacyRole(role, {
      isOrganizationOwner: role === "customer",
    });
    matrix[`${role}_team_member`] = permissionsForLegacyRole(role, {
      teamRole: "member",
    });
  }
  return matrix;
}
