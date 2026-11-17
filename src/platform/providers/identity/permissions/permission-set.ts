/**
 * Permission helpers.
 *
 * Purpose: Reason about ProviderPermission sets.
 * Responsibilities: default sets, containment checks, difference.
 * Usage: Used by the authorization engine and validator.
 * Future Extension: Hierarchical permission implication.
 */

import type { ProviderPermission } from "../contracts/enums";

export const DEFAULT_EXECUTION_PERMISSIONS: readonly ProviderPermission[] = [
  "read",
  "execute",
];

export function missingPermissions(
  granted: readonly ProviderPermission[],
  required: readonly ProviderPermission[]
): readonly ProviderPermission[] {
  return required.filter((p) => !granted.includes(p));
}
