/**
 * Step 11 — Promotion candidate lifecycle (explicit human approval required).
 */

import type { ShadowCandidateRef } from "../shadow/shadow-decision-contract";
import type { PromotionReadinessStatus } from "../shadow/shadow-decision-contract";

export type PromotionCandidateLifecycle =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export type PromotionCandidate = {
  readonly candidateId: string;
  readonly candidateVersion: string;
  readonly lifecycle: PromotionCandidateLifecycle;
  readonly candidate: ShadowCandidateRef;
  readonly scope: {
    readonly service: string;
    readonly subtype?: string;
    readonly industry?: string;
  };
  readonly readinessStatus: PromotionReadinessStatus;
  readonly evidenceCount: number;
  readonly validComparisonSamples: number;
  readonly confidence: string;
  readonly observedAdvantage?: number;
  readonly shadowDecisionId?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectedAt?: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, string>>;
};

export type PromotionCandidateQuery = {
  readonly candidateId?: string;
  readonly lifecycle?: PromotionCandidateLifecycle;
  readonly service?: string;
  readonly industry?: string;
  readonly limit?: number;
};
