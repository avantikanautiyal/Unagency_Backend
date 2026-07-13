/**
 * Credential validator.
 *
 * Purpose: Validate a credential across the required dimensions.
 * Responsibilities: identity/scope/region/policy/expiration/trust/permission.
 * Usage: Called by the identity engine; also usable standalone.
 * Future Extension: Additional dimensions.
 */

import { meetsTrustLevel } from "../contracts/enums";
import type { CredentialValidationCheck } from "../contracts/validation";
import type { CredentialValidationResult } from "../contracts/validation";
import type { IClock } from "../../../shared/interfaces";
import type {
  CredentialValidationRequest,
  ICredentialValidator,
} from "../interfaces/credential-validator";
import { missingPermissions } from "../permissions/permission-set";
import { regionAllowed } from "../policies/credential-policy";
import { scopeCoversRequest } from "../tenancy/tenancy";

export class CredentialValidator implements ICredentialValidator {
  constructor(private readonly clock: IClock) {}

  validate(
    request: CredentialValidationRequest
  ): CredentialValidationResult {
    const { credential, request: sessionRequest, requiredPermissions, nowMs } =
      request;
    const checks: CredentialValidationCheck[] = [];

    checks.push({
      dimension: "identity",
      passed: credential.reference.providerId === sessionRequest.providerId,
      message:
        credential.reference.providerId === sessionRequest.providerId
          ? undefined
          : "provider identity mismatch",
    });

    const coverage = scopeCoversRequest(
      credential.metadata.scope,
      sessionRequest
    );
    checks.push({
      dimension: "scope",
      passed: coverage.covered,
      message: coverage.covered ? undefined : coverage.reasons.join("; "),
    });

    const region = regionAllowed(
      credential.metadata.regionConstraint,
      sessionRequest.region
    );
    checks.push({
      dimension: "region",
      passed: region.allowed,
      message: region.reason,
    });

    const policy = credential.metadata.policy;
    const policyPassed =
      !policy ||
      ((!policy.allowedSchemes ||
        policy.allowedSchemes.includes(credential.reference.scheme)) &&
        meetsTrustLevel(
          credential.metadata.trustLevel,
          policy.minTrustLevel
        ));
    checks.push({
      dimension: "policy",
      passed: policyPassed,
      message: policyPassed ? undefined : "policy constraints not satisfied",
    });

    const notExpired =
      credential.metadata.expiresAt === undefined ||
      Date.parse(credential.metadata.expiresAt) > nowMs;
    checks.push({
      dimension: "expiration",
      passed: notExpired,
      message: notExpired ? undefined : "credential expired",
    });

    const trustPassed = credential.metadata.trustLevel !== "untrusted";
    checks.push({
      dimension: "trust",
      passed: trustPassed,
      message: trustPassed ? undefined : "credential is untrusted",
    });

    const denied = missingPermissions(
      credential.permissions,
      requiredPermissions
    );
    checks.push({
      dimension: "permission",
      passed: denied.length === 0,
      message:
        denied.length === 0
          ? undefined
          : `missing permissions: ${denied.join(", ")}`,
    });

    return {
      valid: checks.every((c) => c.passed),
      credentialId: credential.reference.credentialId,
      checks,
      validatedAt: this.clock.nowIso(),
    };
  }
}
