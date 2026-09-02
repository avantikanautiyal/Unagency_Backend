/**
 * Tenancy helpers.
 *
 * Purpose: Reason about tenancy levels and scope matching.
 * Responsibilities: tenancy ordering + scope containment checks.
 * Usage: Used by the authorization engine to enforce tenant isolation.
 * Future Extension: Service-account tenancy.
 */

import type { TenancyLevel } from "../contracts/enums";
import type { ProviderScope } from "../contracts/provider-scope";
import type { CreateCredentialSessionRequest } from "../contracts/requests";

export const TENANCY_ORDER: readonly TenancyLevel[] = [
  "platform",
  "organization",
  "workspace",
  "project",
  "user",
];

export function tenancyRank(level: TenancyLevel): number {
  return TENANCY_ORDER.indexOf(level);
}

/**
 * A credential scope "covers" a request when every scope constraint that is
 * present matches the request. Absent constraints are treated as wildcards.
 */
export function scopeCoversRequest(
  scope: ProviderScope,
  request: CreateCredentialSessionRequest
): { readonly covered: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];

  if (
    scope.organizationId !== undefined &&
    scope.organizationId !== request.organizationId
  ) {
    reasons.push("organization mismatch");
  }
  if (
    scope.workspaceId !== undefined &&
    scope.workspaceId !== request.workspaceId
  ) {
    reasons.push("workspace mismatch");
  }
  if (
    scope.projectId !== undefined &&
    request.projectId !== undefined &&
    scope.projectId !== request.projectId
  ) {
    reasons.push("project mismatch");
  }
  if (
    scope.userId !== undefined &&
    request.userId !== undefined &&
    scope.userId !== request.userId
  ) {
    reasons.push("user mismatch");
  }
  if (
    scope.providerId !== undefined &&
    scope.providerId !== request.providerId
  ) {
    reasons.push("provider mismatch");
  }
  if (
    scope.capabilityIds !== undefined &&
    scope.capabilityIds.length > 0 &&
    request.capabilityId !== undefined &&
    !scope.capabilityIds.includes(request.capabilityId)
  ) {
    reasons.push("capability not in scope");
  }

  return { covered: reasons.length === 0, reasons };
}
