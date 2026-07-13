/**
 * Authorization engine port.
 *
 * Purpose: Decide whether a credential may act within a requested scope.
 * Responsibilities: capability/provider/tenant/workspace/org/scope/permission checks.
 * Usage: Called by the identity engine during session creation.
 * Future Extension: ABAC/RBAC policy integration (M9 Governance).
 */

import type { Result } from "../../../shared/result";
import type { ProviderAuthorization } from "../contracts/authorization";
import type { ProviderCredential } from "../contracts/credential";
import type { ProviderPermission } from "../contracts/enums";
import type { CreateCredentialSessionRequest } from "../contracts/requests";

export interface AuthorizationRequest {
  readonly credential: ProviderCredential;
  readonly request: CreateCredentialSessionRequest;
  readonly requiredPermissions: readonly ProviderPermission[];
}

export interface IProviderAuthorizationEngine {
  authorize(request: AuthorizationRequest): Result<ProviderAuthorization>;
}
