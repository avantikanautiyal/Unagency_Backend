/**
 * Product-mode governance profiles — AI / Hybrid / Human.
 * Studio handoff remains available in all modes (UI concern); profiles tune review strictness.
 */

import type { ProductMode } from "../contracts/product-mode";
import {
  createDefaultGovernancePolicy,
  DEFAULT_GOVERNANCE_POLICY_ID,
  DEFAULT_GOVERNANCE_POLICY_VERSION,
  type GovernancePolicy,
} from "./policy";
import { CREATIVE_SCORE_RELEASE_GATE } from "../evaluation/creative-score/creative-score-dimensions";

export function createGovernancePolicyForProductMode(input: {
  readonly organizationId: string;
  readonly productMode?: ProductMode;
  readonly nowIso?: () => string;
}): GovernancePolicy {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const base = createDefaultGovernancePolicy(input.organizationId, nowIso);

  switch (input.productMode) {
    case "ai":
      return {
        ...base,
        policyId: `${DEFAULT_GOVERNANCE_POLICY_ID}_ai`,
        policyVersion: DEFAULT_GOVERNANCE_POLICY_VERSION,
        rules: {
          ...base.rules,
          /** AI mode — auto-continue unless creative score or risk fails */
          humanReviewRiskThreshold: 0.92,
          approveMinOverallScore: CREATIVE_SCORE_RELEASE_GATE / 100,
          approveMinCreativeScore: CREATIVE_SCORE_RELEASE_GATE,
          retryOnSpecFailure: true,
          blockOnBrandCritical: true,
        },
      };
    case "hybrid":
      return {
        ...base,
        policyId: `${DEFAULT_GOVERNANCE_POLICY_ID}_hybrid`,
        rules: {
          ...base.rules,
          humanReviewRiskThreshold: 0.6,
          approveMinOverallScore: CREATIVE_SCORE_RELEASE_GATE / 100,
          approveMinCreativeScore: CREATIVE_SCORE_RELEASE_GATE,
        },
      };
    case "human":
      return {
        ...base,
        policyId: `${DEFAULT_GOVERNANCE_POLICY_ID}_human`,
        rules: {
          ...base.rules,
          humanReviewRiskThreshold: 0.35,
          approveMinOverallScore: CREATIVE_SCORE_RELEASE_GATE / 100,
          approveMinCreativeScore: CREATIVE_SCORE_RELEASE_GATE,
          retryOnSpecFailure: false,
          blockOnBrandCritical: true,
        },
      };
    default:
      return base;
  }
}
