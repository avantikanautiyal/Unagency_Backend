/**
 * Negotiation request contracts.
 *
 * Purpose: Immutable input to the negotiation engine.
 * Responsibilities: Wrap an ExecutionPlan with tenant scope + preferences.
 * Usage: Produced by callers (future orchestrator) and builders.
 * Future Extension: Multi-plan negotiation, batch requests.
 */

import type {
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../../core/identifiers";
import type { ExecutionPlan } from "./planning/execution-plan";
import type {
  NegotiableFeature,
  PreferenceKind,
  RiskLevel,
} from "./enums";

export interface ExecutionPreference {
  readonly kind: PreferenceKind;
  /** Relative weight (0..1). Defaults to equal weighting when omitted. */
  readonly weight?: number;
  /** Optional target value, e.g. a preferred provider or model id. */
  readonly value?: string;
}

export interface QualityRequirement {
  readonly minConfidence?: number;
  readonly minEvaluationScore?: number;
  readonly requireHumanReview?: boolean;
  readonly maxRiskLevel?: RiskLevel;
}

/**
 * Immutable negotiation request. The ExecutionPlan is the primary input; the
 * remaining fields provide tenant scope and caller preferences.
 */
export interface NegotiationRequest {
  readonly requestId?: string;
  readonly plan: ExecutionPlan;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: string;
  readonly userId?: UserId;
  readonly region?: string;
  readonly requestedFeatures?: readonly NegotiableFeature[];
  readonly preferences?: readonly ExecutionPreference[];
  readonly quality?: QualityRequirement;
  readonly costCeiling?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
