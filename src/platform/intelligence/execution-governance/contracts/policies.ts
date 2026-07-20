/**
 * Policy contracts — configurable, not hardcoded.
 */

import type { PolicyId } from "./identifiers";
import type { PolicyKind } from "./enums";

export interface PolicyRule {
  readonly policyId: PolicyId;
  readonly kind: PolicyKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly threshold?: number;
  readonly allowedValues?: readonly string[];
  readonly mandatory: boolean;
  readonly description: string;
}

export interface PolicyEvaluationResult {
  readonly policyId: PolicyId;
  readonly kind: PolicyKind;
  readonly passed: boolean;
  readonly actualValue?: number | string;
  readonly threshold?: number | string;
  readonly message: string;
}

export interface PolicyEvaluationReport {
  readonly reportId: string;
  readonly evaluations: readonly PolicyEvaluationResult[];
  readonly allPassed: boolean;
  readonly failedPolicies: readonly PolicyId[];
  readonly rationale: string;
}
