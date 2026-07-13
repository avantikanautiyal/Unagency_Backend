/**
 * Capability policy references.
 *
 * Purpose: Link capabilities to policy identifiers without implementing policies.
 * Responsibilities: Hold policy reference IDs for later policy engine resolution.
 * Usage: CapabilityDefinition.policies; policies module owns evaluation.
 * Future Extension: Inline policy snippets for marketplace packs.
 */

export interface PolicyReference {
  readonly policyId: string;
  readonly version?: string;
}

export interface CapabilityPolicyReferences {
  readonly executionPolicy?: PolicyReference;
  readonly retryPolicy?: PolicyReference;
  readonly evaluationPolicy?: PolicyReference;
  readonly humanReviewPolicy?: PolicyReference;
  readonly securityPolicy?: PolicyReference;
  readonly costPolicy?: PolicyReference;
}
