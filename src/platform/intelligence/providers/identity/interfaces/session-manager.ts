/**
 * Credential session manager port.
 *
 * Purpose: Own the lifecycle of credential sessions (in-memory).
 * Responsibilities: acquire/release/renew/expire/invalidate + lookup.
 * Usage: Injected into the identity engine.
 * Future Extension: Distributed session coordination.
 */

import type { Result } from "../../../shared/result";
import type {
  ProviderAuthenticationResult,
  ProviderAuthorization,
} from "../contracts/authorization";
import type { CredentialReference } from "../contracts/credential";
import type {
  AuthenticationScheme,
  ProviderPermission,
  ProviderTrustLevel,
} from "../contracts/enums";
import type { CredentialId } from "../contracts/identifiers";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderScope } from "../contracts/provider-scope";
import type { CredentialSession } from "../contracts/session";
import type { CredentialValidationResult } from "../contracts/validation";

export interface AcquireSessionInput {
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
  readonly ttlMs?: number;
}

export interface ICredentialSessionManager {
  acquire(input: AcquireSessionInput): Result<CredentialSession>;
  get(sessionId: string): Result<CredentialSession>;
  renew(sessionId: string, ttlMs?: number): Result<CredentialSession>;
  release(sessionId: string): Result<void>;
  expire(sessionId: string): Result<void>;
  invalidate(sessionId: string): Result<void>;
}
