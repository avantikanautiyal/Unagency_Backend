/**
 * Evaluation contracts.
 *
 * Purpose: Immutable outputs of budget/regional/quality/policy/identity analysis.
 * Responsibilities: Describe evaluation results with reasons.
 * Usage: Produced by the respective negotiators; embedded in the outcome.
 * Future Extension: Cost breakdowns, residency proofs, attestation evidence.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { RiskLevel } from "./enums";

export interface BudgetEvaluation {
  readonly withinBudget: boolean;
  readonly maxCost?: number;
  readonly maxTokens?: number;
  readonly currency?: string;
  readonly costCeiling?: number;
  readonly reasons: readonly string[];
}

export interface RegionalEvaluation {
  readonly allowed: boolean;
  readonly requestedRegion?: string;
  readonly providerRegions: readonly string[];
  readonly reasons: readonly string[];
}

export interface QualityEvaluation {
  readonly satisfied: boolean;
  readonly minConfidence?: number;
  readonly minEvaluationScore?: number;
  readonly humanReviewRequired: boolean;
  readonly riskLevel: RiskLevel;
  readonly reasons: readonly string[];
}

export interface PolicyEvaluation {
  readonly satisfied: boolean;
  readonly consultedPolicies: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * Identity evaluation is derived by consulting the Provider Identity Platform
 * through its interface. It NEVER contains secret material.
 */
export interface IdentityEvaluation {
  /** Whether identity validation was actually attempted (engine configured). */
  readonly attempted: boolean;
  readonly validated: boolean;
  readonly providerId: ProviderId;
  readonly trustLevel?: string;
  readonly grantedPermissions: readonly string[];
  readonly sessionId?: string;
  readonly reasons: readonly string[];
}
