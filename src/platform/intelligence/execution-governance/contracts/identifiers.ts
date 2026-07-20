/**
 * Execution Governance branded identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type GovernancePlanId = Brand<string, "GovernancePlanId">;
export type GovernanceResultId = Brand<string, "GovernanceResultId">;
export type GovernanceDecisionId = Brand<string, "GovernanceDecisionId">;
export type PolicyId = Brand<string, "PolicyId">;

function branded<T extends string>(value: string, label: string): T {
  if (!value?.trim()) throw new Error(`${label} cannot be empty`);
  return value as T;
}

export const asGovernancePlanId = (v: string): GovernancePlanId => branded(v, "GovernancePlanId");
export const asGovernanceResultId = (v: string): GovernanceResultId => branded(v, "GovernanceResultId");
export const asGovernanceDecisionId = (v: string): GovernanceDecisionId => branded(v, "GovernanceDecisionId");
export const asPolicyId = (v: string): PolicyId => branded(v, "PolicyId");
