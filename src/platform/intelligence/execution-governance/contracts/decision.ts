/**
 * Governance decision and authorization contracts.
 */

import type { GovernanceDecisionId } from "./identifiers";
import type { GovernanceDecisionKind } from "./enums";
import type { RiskAssessment } from "./risk";

export interface GovernanceDecision {
  readonly decisionId: GovernanceDecisionId;
  readonly kind: GovernanceDecisionKind;
  readonly reason: string;
  readonly explanation: string;
  readonly requiredActions: readonly string[];
  readonly missingApprovals: readonly string[];
  readonly conditions?: readonly string[];
  readonly riskSummary: string;
  readonly timestamp: string;
}

export interface ExecutionAuthorization {
  readonly authorizationId: string;
  readonly authorized: boolean;
  readonly decision: GovernanceDecisionKind;
  readonly validUntil?: string;
  readonly constraints: readonly string[];
  readonly rationale: string;
}

export interface EscalationRequirement {
  readonly escalationId: string;
  readonly level: string;
  readonly reason: string;
  readonly targetRole: string;
  readonly blocking: boolean;
}

export interface EscalationPlan {
  readonly planId: string;
  readonly requirements: readonly EscalationRequirement[];
  readonly rationale: string;
}
