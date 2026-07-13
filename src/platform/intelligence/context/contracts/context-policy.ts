/**
 * Context policy references only — no policy execution.
 */

export interface ContextPolicyReference {
  readonly policyId: string;
  readonly version?: string;
}

export interface ContextPolicy {
  readonly brandPolicy?: ContextPolicyReference;
  readonly securityPolicy?: ContextPolicyReference;
  readonly executionPolicy?: ContextPolicyReference;
  readonly privacyPolicy?: ContextPolicyReference;
  readonly compliancePolicy?: ContextPolicyReference;
  readonly localizationPolicy?: ContextPolicyReference;
}
