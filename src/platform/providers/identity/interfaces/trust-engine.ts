/**
 * Trust engine port.
 *
 * Purpose: Evaluate whether a credential/provider is trusted for a request.
 * Responsibilities: trust level, credential validation, provider verification,
 *   region validation, classification, and policy validation.
 * Usage: Called by the identity engine during session creation.
 * Future Extension: Attestation hooks (e.g. hardware/remote attestation).
 */

import type { Result } from "../../../core/result";
import type { TrustEvaluation } from "../contracts/authorization";
import type { ProviderCredential } from "../contracts/credential";
import type { CreateCredentialSessionRequest } from "../contracts/requests";

export interface TrustEvaluationRequest {
  readonly credential: ProviderCredential;
  readonly request: CreateCredentialSessionRequest;
}

export interface IProviderTrustEngine {
  evaluate(request: TrustEvaluationRequest): Result<TrustEvaluation>;
}
