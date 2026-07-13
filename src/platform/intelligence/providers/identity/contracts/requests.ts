/**
 * Request/input contracts for the identity platform.
 *
 * Purpose: Immutable inputs to engines and the store.
 * Responsibilities: Describe registration, resolution, and session requests.
 * Usage: Passed to the identity engine, store, and sub-engines.
 * Future Extension: Delegation and impersonation requests.
 *
 * `RegisterCredentialInput.secret` is the ONLY place a raw secret enters the
 * platform. It is immediately handed to ISecretProvider and never retained in
 * any contract, log, or snapshot.
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  UserId,
  WorkspaceId,
} from "../../../shared/identifiers";
import type {
  CredentialPolicy,
  CredentialRotationPolicy,
} from "./credential";
import type {
  AuthenticationScheme,
  CredentialStatus,
  ProviderPermission,
  ProviderTrustLevel,
  TenancyLevel,
} from "./enums";
import type {
  ProviderRegionConstraint,
  ProviderScope,
} from "./provider-scope";

export interface RegisterCredentialInput {
  readonly providerId: ProviderId;
  readonly scheme: AuthenticationScheme;
  /** Raw secret — consumed by ISecretProvider, never retained. */
  readonly secret: string;
  readonly tenancy: TenancyLevel;
  readonly scope: ProviderScope;
  readonly trustLevel?: ProviderTrustLevel;
  readonly permissions?: readonly ProviderPermission[];
  readonly expiresAt?: string;
  readonly rotationPolicy?: CredentialRotationPolicy;
  readonly regionConstraint?: ProviderRegionConstraint;
  readonly policy?: CredentialPolicy;
  readonly labels?: Readonly<Record<string, unknown>>;
}

export interface CredentialFilter {
  readonly providerId?: ProviderId;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly status?: CredentialStatus;
}

export interface ResolveIdentityRequest {
  readonly providerId: ProviderId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: string;
  readonly userId?: UserId;
}

export interface CreateCredentialSessionRequest {
  readonly providerId: ProviderId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: string;
  readonly userId?: UserId;
  readonly capabilityId?: CapabilityId;
  readonly requiredPermissions?: readonly ProviderPermission[];
  readonly region?: string;
  readonly classification?: string;
  readonly ttlMs?: number;
  readonly actor?: string;
}
