/**
 * Default policy provider (allow-all placeholder).
 *
 * Purpose: Provide a safe default that consults but never mutates policies.
 * Responsibilities: Return allow decisions unless a deny-list overrides.
 * Usage: Injected into the policy negotiator; replaceable in later milestones.
 * Future Extension: Org/platform policy engines (M9 Governance).
 */

import type {
  IPolicyProvider,
  PolicyConsultationRequest,
  PolicyDecision,
} from "../interfaces/policy-provider";

export class DefaultPolicyProvider implements IPolicyProvider {
  constructor(private readonly deniedPolicyRefs: readonly string[] = []) {}

  consult(request: PolicyConsultationRequest): readonly PolicyDecision[] {
    return request.policyRefs.map((policyRef) => {
      const denied = this.deniedPolicyRefs.includes(policyRef);
      return {
        policyRef,
        allowed: !denied,
        reason: denied ? "policy explicitly denied" : undefined,
      };
    });
  }
}
