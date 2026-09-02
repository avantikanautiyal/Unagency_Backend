/**
 * Credential validator port.
 *
 * Purpose: Validate a credential across identity/scope/region/policy/
 *   expiration/trust/permission dimensions.
 * Responsibilities: Produce a CredentialValidationResult.
 * Usage: Called by the identity engine; also usable standalone.
 * Future Extension: Additional dimensions.
 */

import type { ProviderCredential } from "../contracts/credential";
import type { ProviderPermission } from "../contracts/enums";
import type { CreateCredentialSessionRequest } from "../contracts/requests";
import type { CredentialValidationResult } from "../contracts/validation";

export interface CredentialValidationRequest {
  readonly credential: ProviderCredential;
  readonly request: CreateCredentialSessionRequest;
  readonly requiredPermissions: readonly ProviderPermission[];
  readonly nowMs: number;
}

export interface ICredentialValidator {
  validate(request: CredentialValidationRequest): CredentialValidationResult;
}
