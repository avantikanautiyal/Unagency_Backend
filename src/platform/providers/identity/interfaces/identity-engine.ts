/**
 * Provider identity engine port (the platform facade).
 *
 * Purpose: Resolve identities and mint validated, secret-free credential sessions.
 * Responsibilities: identity resolution, credential resolution, trust validation,
 *   session creation; NEVER exposes secret material.
 * Usage: The Provider Runtime requests a session via this interface.
 * Future Extension: Delegation, impersonation, attestation.
 */

import type { Result } from "../../../core/result";
import type { CredentialReference } from "../contracts/credential";
import type { CredentialId } from "../contracts/identifiers";
import type { ProviderIdentity, ProviderIdentitySnapshot } from "../contracts/provider-identity";
import type {
  CreateCredentialSessionRequest,
  ResolveIdentityRequest,
} from "../contracts/requests";
import type { CredentialSession } from "../contracts/session";

export interface IProviderIdentityEngine {
  resolveIdentity(request: ResolveIdentityRequest): Result<ProviderIdentity>;
  resolveCredentialReference(
    request: ResolveIdentityRequest
  ): Result<CredentialReference>;
  createCredentialSession(
    request: CreateCredentialSessionRequest
  ): Promise<Result<CredentialSession>>;
  releaseSession(sessionId: string): Result<void>;
  snapshot(credentialId: CredentialId): Result<ProviderIdentitySnapshot>;
}
