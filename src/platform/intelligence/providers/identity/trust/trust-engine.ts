/**
 * Provider trust engine.
 *
 * Purpose: Evaluate whether a credential/provider is trusted for a request.
 * Responsibilities: trust level, credential validation, provider verification,
 *   region validation, classification validation, policy validation.
 * Usage: Called by the identity engine during session creation.
 * Future Extension: Attestation hooks via injected verifiers.
 */

import { meetsTrustLevel, type ProviderTrustLevel } from "../contracts/enums";
import type { TrustCheck, TrustEvaluation } from "../contracts/authorization";
import type { ProviderCredential } from "../contracts/credential";
import type { IClock } from "../../../shared/interfaces";
import { success, type Result } from "../../../shared/result";
import type {
  IProviderTrustEngine,
  TrustEvaluationRequest,
} from "../interfaces/trust-engine";
import { regionAllowed } from "../policies/credential-policy";

/**
 * Optional attestation hook. Future milestones can inject a verifier without
 * modifying this engine.
 */
export interface IProviderAttestationVerifier {
  verify(
    credential: ProviderCredential,
    classification?: string
  ): { readonly verified: boolean; readonly message?: string };
}

export class ProviderTrustEngine implements IProviderTrustEngine {
  constructor(
    private readonly clock: IClock,
    private readonly minTrustLevel: ProviderTrustLevel = "standard",
    private readonly attestationVerifier?: IProviderAttestationVerifier
  ) {}

  evaluate(request: TrustEvaluationRequest): Result<TrustEvaluation> {
    const { credential, request: sessionRequest } = request;
    const checks: TrustCheck[] = [];

    const trustPassed = meetsTrustLevel(
      credential.metadata.trustLevel,
      this.minTrustLevel
    );
    checks.push({
      dimension: "trust",
      passed: trustPassed,
      message: trustPassed
        ? undefined
        : `trust level '${credential.metadata.trustLevel}' below required '${this.minTrustLevel}'`,
    });

    const credentialValid = credential.metadata.status === "active";
    checks.push({
      dimension: "identity",
      passed: credentialValid,
      message: credentialValid
        ? undefined
        : `credential status is '${credential.metadata.status}'`,
    });

    const providerVerified =
      credential.reference.providerId === sessionRequest.providerId;
    checks.push({
      dimension: "identity",
      passed: providerVerified,
      message: providerVerified ? undefined : "provider verification failed",
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

    const attestation = this.attestationVerifier?.verify(
      credential,
      sessionRequest.classification
    ) ?? { verified: true };
    checks.push({
      dimension: "policy",
      passed: attestation.verified,
      message: attestation.message,
    });

    return success({
      trusted: checks.every((c) => c.passed),
      providerId: sessionRequest.providerId,
      credentialId: credential.reference.credentialId,
      trustLevel: credential.metadata.trustLevel,
      checks,
      evaluatedAt: this.clock.nowIso(),
    });
  }
}
