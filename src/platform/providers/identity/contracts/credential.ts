/**
 * Credential contracts.
 *
 * Purpose: Immutable credential reference, metadata, policy, and record.
 * Responsibilities: Describe credentials WITHOUT ever holding secret material.
 * Usage: Produced by the credential store; consumed across the platform.
 * Future Extension: Structured secret descriptors for multiple secret managers.
 *
 * IMPORTANT: No contract in this file may contain a raw secret. Secret material
 * lives only behind ISecretProvider, referenced by `secretRef`.
 */

import type { ProviderId } from "../../../core/identifiers";
import type {
  AuthenticationScheme,
  CredentialStatus,
  ProviderPermission,
  ProviderTrustLevel,
  RotationReason,
  TenancyLevel,
} from "./enums";
import type { CredentialId } from "./identifiers";
import type {
  ProviderRegionConstraint,
  ProviderScope,
} from "./provider-scope";

/**
 * Opaque handle to a credential. `secretRef` points into an ISecretProvider —
 * it is NOT the secret itself.
 */
export interface CredentialReference {
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly scheme: AuthenticationScheme;
  readonly secretRef: string;
}

export interface CredentialRotationPolicy {
  readonly enabled: boolean;
  readonly intervalMs?: number;
  readonly maxAgeMs?: number;
  readonly rotateOnExpiry?: boolean;
}

export interface CredentialPolicy {
  readonly policyId: string;
  readonly minTrustLevel: ProviderTrustLevel;
  readonly allowedSchemes?: readonly AuthenticationScheme[];
  readonly requiredPermissions?: readonly ProviderPermission[];
  readonly allowedRegions?: readonly string[];
  readonly maxSessionTtlMs?: number;
  readonly allowDelegation?: boolean;
}

export interface CredentialMetadata {
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly scheme: AuthenticationScheme;
  readonly tenancy: TenancyLevel;
  readonly scope: ProviderScope;
  readonly trustLevel: ProviderTrustLevel;
  readonly status: CredentialStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly rotatedAt?: string;
  readonly lastRotationReason?: RotationReason;
  readonly rotationPolicy?: CredentialRotationPolicy;
  readonly regionConstraint?: ProviderRegionConstraint;
  readonly policy?: CredentialPolicy;
  readonly labels?: Readonly<Record<string, unknown>>;
}

/**
 * A stored credential: reference + metadata + granted permissions.
 * Contains no secret material.
 */
export interface ProviderCredential {
  readonly reference: CredentialReference;
  readonly metadata: CredentialMetadata;
  readonly permissions: readonly ProviderPermission[];
}
