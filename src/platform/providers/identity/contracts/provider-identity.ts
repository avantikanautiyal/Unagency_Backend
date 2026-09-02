/**
 * Provider identity contracts.
 *
 * Purpose: Resolved provider identity within a tenant + masked snapshot.
 * Responsibilities: Describe identity binding, trust, and scope (no secrets).
 * Usage: Produced by the identity engine.
 * Future Extension: Attestation evidence attached to identity.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { CredentialMetadata, CredentialReference } from "./credential";
import type { ProviderTrustLevel, TenancyLevel } from "./enums";
import type { ProviderScope, ProviderTenantBinding } from "./provider-scope";

export interface ProviderIdentity {
  readonly providerId: ProviderId;
  readonly tenancy: TenancyLevel;
  readonly binding: ProviderTenantBinding;
  readonly trustLevel: ProviderTrustLevel;
  readonly scope: ProviderScope;
  readonly credentialRef?: CredentialReference;
}

/**
 * Point-in-time identity snapshot. Any secret is represented only as a masked
 * string — never the raw value.
 */
export interface ProviderIdentitySnapshot {
  readonly identity: ProviderIdentity;
  readonly credential?: CredentialMetadata;
  readonly maskedSecret?: string;
  readonly capturedAt: string;
}
