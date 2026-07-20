/**
 * Business RBAC — SaaS product permissions (separate from API gateway RBAC).
 */

import type { BusinessPermission, BusinessRole } from "../contracts";

const ROLE_MAP: Record<BusinessRole, readonly BusinessPermission[]> = {
  owner: [
    "org:manage",
    "workspace:manage",
    "project:manage",
    "brand:manage",
    "campaign:manage",
    "knowledge:manage",
    "workflow:manage",
    "execution:request",
    "execution:read",
    "approval:decide",
    "billing:manage",
    "marketplace:publish",
    "analytics:read",
    "audit:read",
    "team:manage",
    "settings:manage",
  ],
  admin: [
    "org:manage",
    "workspace:manage",
    "project:manage",
    "brand:manage",
    "campaign:manage",
    "knowledge:manage",
    "workflow:manage",
    "execution:request",
    "execution:read",
    "approval:decide",
    "marketplace:publish",
    "analytics:read",
    "audit:read",
    "team:manage",
    "settings:manage",
  ],
  manager: [
    "workspace:manage",
    "project:manage",
    "brand:manage",
    "campaign:manage",
    "knowledge:manage",
    "workflow:manage",
    "execution:request",
    "execution:read",
    "approval:decide",
    "analytics:read",
    "team:manage",
  ],
  contributor: [
    "campaign:manage",
    "knowledge:manage",
    "execution:request",
    "execution:read",
    "analytics:read",
  ],
  reviewer: ["execution:read", "approval:decide", "analytics:read"],
  viewer: ["execution:read", "analytics:read"],
  billing: ["billing:manage", "analytics:read", "audit:read"],
};

export function permissionsForRoles(roles: readonly BusinessRole[]): BusinessPermission[] {
  const set = new Set<BusinessPermission>();
  for (const r of roles) for (const p of ROLE_MAP[r] ?? []) set.add(p);
  return [...set];
}

export function hasBusinessPermission(
  granted: readonly BusinessPermission[],
  required: BusinessPermission
): boolean {
  return granted.includes(required);
}
