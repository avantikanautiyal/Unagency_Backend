/**
 * Permission helpers.
 *
 * Purpose: Reason about ProviderPermission sets.
 * Responsibilities: default sets, containment checks, difference.
 * Usage: Used by the authorization engine and validator.
 * Future Extension: Hierarchical permission implication.
 */

import type { ProviderPermission } from "../contracts/enums";

export const ALL_PERMISSIONS: readonly ProviderPermission[] = [
  "read",
  "execute",
  "manage",
  "rotate",
  "delete",
  "delegate",
  "audit",
];

export const DEFAULT_EXECUTION_PERMISSIONS: readonly ProviderPermission[] = [
  "read",
  "execute",
];

export function hasPermission(
  granted: readonly ProviderPermission[],
  required: ProviderPermission
): boolean {
  return granted.includes(required);
}

export function hasAllPermissions(
  granted: readonly ProviderPermission[],
  required: readonly ProviderPermission[]
): boolean {
  return required.every((p) => granted.includes(p));
}

export function missingPermissions(
  granted: readonly ProviderPermission[],
  required: readonly ProviderPermission[]
): readonly ProviderPermission[] {
  return required.filter((p) => !granted.includes(p));
}
