/**
 * Phase 7 — Refinement request contracts.
 */

export const OS_REFINEMENT_VERSION = "phase7.1" as const;
export const MAX_REFINEMENT_QUESTIONS = 5 as const;

export type RefinementMode = "AI" | "HYBRID";

export type RefinementRequestStatus =
  | "PENDING_FEEDBACK"
  | "FEEDBACK_IN_PROGRESS"
  | "SPEC_READY"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED_CONFLICT";

export type RefinementOutputType =
  | "caption"
  | "social_creative"
  | "landing_page"
  | "website"
  | "campaign_strategy"
  | "video"
  | "copy"
  | "logo"
  | "brochure"
  | "email"
  | "strategy"
  | "presentation"
  | "generic";

export interface RefinementRequest {
  readonly refinementId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly sourceOutputId: string;
  readonly sourceVersion: number;
  readonly sourcePreview?: string;
  readonly outputType: RefinementOutputType;
  readonly outputContractId?: string;
  readonly mode: RefinementMode;
  readonly status: RefinementRequestStatus;
  readonly feedbackSessionId?: string;
  readonly refinementVersion: number;
  readonly planId?: string;
  readonly planVersion?: number;
  readonly sourceApprovalStatus?: string;
  readonly brandTone?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  /** Selected product brand for compounding Brand Intelligence learning. */
  readonly brandId?: string;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}
