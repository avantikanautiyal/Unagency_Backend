/**
 * Credential session contracts.
 *
 * Purpose: The validated, secret-free artifact handed to the Provider Runtime.
 * Responsibilities: Bundle identity decision outputs + a lease + a reference.
 * Usage: Produced by the identity engine / session manager.
 * Future Extension: Short-lived derived tokens (still no raw secret exposure).
 *
 * A CredentialSession NEVER contains raw secret material — only a
 * CredentialReference handle that an adapter may later redeem via ISecretProvider.
 */

import type { ProviderId } from "../../../core/identifiers";
import type {
  ProviderAuthenticationResult,
  ProviderAuthorization,
} from "./authorization";
import type { CredentialReference } from "./credential";
import type {
  AuthenticationScheme,
  CredentialSessionStatus,
  ProviderPermission,
  ProviderTrustLevel,
} from "./enums";
import type { CredentialId } from "./identifiers";
import type { ProviderScope } from "./provider-scope";
import type { CredentialValidationResult } from "./validation";

export interface CredentialLease {
  readonly leaseId: string;
  readonly sessionId: string;
  readonly credentialId: CredentialId;
  readonly acquiredAt: string;
  readonly expiresAt?: string;
}

export interface CredentialSession {
  readonly sessionId: string;
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly scheme: AuthenticationScheme;
  readonly scope: ProviderScope;
  readonly trustLevel: ProviderTrustLevel;
  readonly grantedPermissions: readonly ProviderPermission[];
  readonly reference: CredentialReference;
  readonly authentication: ProviderAuthenticationResult;
  readonly authorization: ProviderAuthorization;
  readonly validation: CredentialValidationResult;
  readonly status: CredentialSessionStatus;
  readonly lease: CredentialLease;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}
