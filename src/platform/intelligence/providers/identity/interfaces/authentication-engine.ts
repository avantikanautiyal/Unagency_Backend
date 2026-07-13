/**
 * Authentication engine port.
 *
 * Purpose: Verify a credential's authentication scheme (no networking).
 * Responsibilities: Confirm scheme support and credential usability.
 * Usage: Called by the identity engine during session creation.
 * Future Extension: Real OAuth2/JWT verification inside adapters — NOT here.
 */

import type { Result } from "../../../shared/result";
import type { ProviderAuthenticationResult } from "../contracts/authorization";
import type { ProviderCredential } from "../contracts/credential";
import type { AuthenticationScheme } from "../contracts/enums";

export interface AuthenticationRequest {
  readonly credential: ProviderCredential;
  /** True when the secret exists behind the ISecretProvider. */
  readonly secretPresent: boolean;
}

export interface IProviderAuthenticationEngine {
  supports(scheme: AuthenticationScheme): boolean;
  authenticate(
    request: AuthenticationRequest
  ): Result<ProviderAuthenticationResult>;
}
