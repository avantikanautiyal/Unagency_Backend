/**
 * Versioned governance policy — deterministic mapping of evaluations → decisions.
 */

import { CREATIVE_SCORE_RELEASE_GATE } from "../evaluation/creative-score/creative-score-dimensions";
import { defaultRequiredEvaluatorIds } from "../evaluation/registry/evaluator-registry";

export const DEFAULT_GOVERNANCE_POLICY_ID = "default_os_governance" as const;
export const DEFAULT_GOVERNANCE_POLICY_VERSION = "1.0.0" as const;

export type GovernanceDecisionAction =
  | "CONTINUE"
  | "RETRY"
  | "BLOCK"
  | "HUMAN_REVIEW"
  | "REJECT"
  | "APPROVE";

export interface GovernancePolicyRules {
  /** Spec FAIL → RETRY when true */
  readonly retryOnSpecFailure: boolean;
  /** Brand critical → BLOCK */
  readonly blockOnBrandCritical: boolean;
  /** Quality human-review outcome or risk >= threshold → HUMAN_REVIEW */
  readonly humanReviewRiskThreshold: number;
  /** Min overall score for APPROVE at execution level (0–1 normalized) */
  readonly approveMinOverallScore: number;
  /** Track B3 — min creative score /100 for customer release */
  readonly approveMinCreativeScore: number;
  /** Required evaluator IDs */
  readonly requiredEvaluators: readonly string[];
}

export interface GovernancePolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly organizationId: string | "*";
  readonly rules: GovernancePolicyRules;
  readonly createdAt: string;
}

export function createDefaultGovernancePolicy(
  organizationId: string | "*" = "*",
  nowIso: () => string = () => new Date().toISOString()
): GovernancePolicy {
  return {
    policyId: DEFAULT_GOVERNANCE_POLICY_ID,
    policyVersion: DEFAULT_GOVERNANCE_POLICY_VERSION,
    organizationId,
    createdAt: nowIso(),
    rules: {
      retryOnSpecFailure: true,
      blockOnBrandCritical: true,
      humanReviewRiskThreshold: 0.6,
      approveMinOverallScore: CREATIVE_SCORE_RELEASE_GATE / 100,
      approveMinCreativeScore: CREATIVE_SCORE_RELEASE_GATE,
      requiredEvaluators: defaultRequiredEvaluatorIds(),
    },
  };
}
