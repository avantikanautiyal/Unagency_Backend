/**
 * Scope, tenant binding, and region constraint contracts.
 *
 * Purpose: Describe what a credential/identity is scoped to.
 * Responsibilities: Immutable scope, tenancy, and region descriptors.
 * Usage: Embedded in identity, credential, and session contracts.
 * Future Extension: Service-account and delegation scopes.
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  UserId,
  WorkspaceId,
} from "../../../shared/identifiers";
import type { TenancyLevel } from "./enums";

export interface ProviderScope {
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly projectId?: string;
  readonly userId?: UserId;
  readonly providerId?: ProviderId;
  readonly capabilityIds?: readonly CapabilityId[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ProviderTenantBinding {
  readonly providerId: ProviderId;
  readonly tenancy: TenancyLevel;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly projectId?: string;
  readonly userId?: UserId;
}

export interface ProviderRegionConstraint {
  readonly allowedRegions: readonly string[];
  readonly deniedRegions?: readonly string[];
  readonly dataResidency?: string;
}
