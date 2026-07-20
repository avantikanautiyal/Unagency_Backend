/**
 * Role → permission map (RBAC).
 */

import type { Permission, RoleName } from "../contracts";

const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  owner: ["admin:*"],
  admin: [
    "org:read",
    "org:write",
    "workspace:read",
    "workspace:write",
    "execution:create",
    "execution:read",
    "execution:cancel",
    "execution:retry",
    "execution:stream",
    "capability:read",
    "provider:read",
    "benchmark:read",
    "analytics:read",
    "billing:read",
    "billing:write",
    "notification:read",
    "audit:read",
    "file:upload",
    "file:read",
    "review:read",
    "review:write",
  ],
  member: [
    "org:read",
    "workspace:read",
    "workspace:write",
    "execution:create",
    "execution:read",
    "execution:cancel",
    "execution:retry",
    "execution:stream",
    "capability:read",
    "provider:read",
    "benchmark:read",
    "analytics:read",
    "notification:read",
    "file:upload",
    "file:read",
    "review:read",
    "review:write",
  ],
  viewer: [
    "org:read",
    "workspace:read",
    "execution:read",
    "capability:read",
    "provider:read",
    "benchmark:read",
    "analytics:read",
    "notification:read",
    "file:read",
    "review:read",
  ],
  billing: ["org:read", "billing:read", "billing:write", "analytics:read"],
  service: [
    "execution:create",
    "execution:read",
    "execution:cancel",
    "execution:retry",
    "execution:stream",
    "capability:read",
    "provider:read",
    "file:upload",
    "file:read",
  ],
};

export function permissionsForRoles(roles: readonly RoleName[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  return [...set];
}

export function hasPermission(
  granted: readonly Permission[],
  required: readonly Permission[]
): boolean {
  if (granted.includes("admin:*")) return true;
  return required.every((r) => granted.includes(r));
}
