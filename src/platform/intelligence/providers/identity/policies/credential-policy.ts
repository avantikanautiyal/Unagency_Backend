/**
 * Credential policy helpers.
 *
 * Purpose: Provide default policies and region evaluation.
 * Responsibilities: default policy factory + region allow/deny checks.
 * Usage: Used by the validator and trust engine.
 * Future Extension: Policy inheritance and org-level policy resolution.
 */

import type { CredentialPolicy } from "../contracts/credential";
import type { ProviderRegionConstraint } from "../contracts/provider-scope";

export function defaultCredentialPolicy(): CredentialPolicy {
  return {
    policyId: "default",
    minTrustLevel: "standard",
    allowDelegation: false,
  };
}

export function regionAllowed(
  constraint: ProviderRegionConstraint | undefined,
  region: string | undefined
): { readonly allowed: boolean; readonly reason?: string } {
  if (!constraint) {
    return { allowed: true };
  }
  if (region === undefined) {
    // No region requested — nothing to violate.
    return { allowed: true };
  }
  if (constraint.deniedRegions?.includes(region)) {
    return { allowed: false, reason: `region '${region}' explicitly denied` };
  }
  if (
    constraint.allowedRegions.length > 0 &&
    !constraint.allowedRegions.includes(region)
  ) {
    return { allowed: false, reason: `region '${region}' not allowed` };
  }
  return { allowed: true };
}
