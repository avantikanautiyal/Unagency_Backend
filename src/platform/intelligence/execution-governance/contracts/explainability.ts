/**
 * Explainability contracts.
 */

export interface GovernanceExplanation {
  readonly approvalRationale: string;
  readonly blockRationale?: string;
  readonly policyTriggers: readonly string[];
  readonly budgetThresholds: readonly string[];
  readonly requiredApprovals: readonly string[];
  readonly riskFindings: readonly string[];
  readonly complianceFindings: readonly string[];
}
