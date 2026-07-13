/**
 * Provider authorization engine.
 *
 * Purpose: Decide whether a credential may act within a requested scope.
 * Responsibilities: capability/provider/tenant/workspace/org/scope/permission checks.
 * Usage: Called by the identity engine during session creation.
 * Future Extension: RBAC/ABAC policy integration (M9 Governance).
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderAuthorization } from "../contracts/authorization";
import type { ProviderCredential } from "../contracts/credential";
import type { ProviderPermission } from "../contracts/enums";
import type { CreateCredentialSessionRequest } from "../contracts/requests";
import type {
  AuthorizationRequest,
  IProviderAuthorizationEngine,
} from "../interfaces/authorization-engine";
import { missingPermissions } from "../permissions/permission-set";
import { scopeCoversRequest } from "../tenancy/tenancy";

export class ProviderAuthorizationEngine
  implements IProviderAuthorizationEngine
{
  authorize(request: AuthorizationRequest): Result<ProviderAuthorization> {
    const { credential, request: sessionRequest, requiredPermissions } =
      request;
    const reasons: string[] = [];

    this.checkProvider(credential, sessionRequest, reasons);
    this.checkScope(credential, sessionRequest, reasons);
    const denied = this.checkPermissions(
      credential,
      requiredPermissions,
      reasons
    );

    const authorized = reasons.length === 0;
    const granted = authorized
      ? this.grantedPermissions(credential, requiredPermissions)
      : [];

    return success({
      authorized,
      providerId: sessionRequest.providerId,
      scope: credential.metadata.scope,
      grantedPermissions: granted,
      deniedPermissions: denied,
      reasons,
    });
  }

  private checkProvider(
    credential: ProviderCredential,
    request: CreateCredentialSessionRequest,
    reasons: string[]
  ): void {
    if (credential.reference.providerId !== request.providerId) {
      reasons.push("provider mismatch");
    }
    if (credential.metadata.status !== "active") {
      reasons.push(`credential status is '${credential.metadata.status}'`);
    }
  }

  private checkScope(
    credential: ProviderCredential,
    request: CreateCredentialSessionRequest,
    reasons: string[]
  ): void {
    const coverage = scopeCoversRequest(credential.metadata.scope, request);
    if (!coverage.covered) {
      reasons.push(...coverage.reasons);
    }
  }

  private checkPermissions(
    credential: ProviderCredential,
    required: readonly ProviderPermission[],
    reasons: string[]
  ): readonly ProviderPermission[] {
    const denied = missingPermissions(credential.permissions, required);
    if (denied.length > 0) {
      reasons.push(`missing permissions: ${denied.join(", ")}`);
    }
    return denied;
  }

  private grantedPermissions(
    credential: ProviderCredential,
    required: readonly ProviderPermission[]
  ): readonly ProviderPermission[] {
    if (required.length === 0) {
      return credential.permissions;
    }
    return required.filter((p) => credential.permissions.includes(p));
  }
}
