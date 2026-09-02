/**
 * Policy provider port (consulted, never mutated).
 *
 * Purpose: Abstract policy decisions consulted during negotiation.
 * Responsibilities: Return allow/deny decisions for a set of policy refs.
 * Usage: Injected into the policy negotiator; default allows all.
 * Future Extension: Org/platform policy engines (M9 Governance).
 *
 * The negotiation platform NEVER changes policies — it only consults them.
 */

export interface PolicyDecision {
  readonly policyRef: string;
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface PolicyConsultationRequest {
  readonly policyRefs: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface IPolicyProvider {
  consult(request: PolicyConsultationRequest): readonly PolicyDecision[];
}
