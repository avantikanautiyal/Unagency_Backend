/**
 * Phase 7 — Feedback session (max 5 MCQs, server-enforced).
 */

import { MAX_REFINEMENT_QUESTIONS, type RefinementOutputType } from "./refinement-request";

export type FeedbackSessionStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface FeedbackAnswer {
  readonly questionId: string;
  readonly dimension: string;
  readonly optionIds: readonly string[];
  readonly values: readonly string[];
  readonly refinementSignals: readonly string[];
  readonly otherText?: string;
  readonly answeredAt: string;
}

export interface FeedbackSession {
  readonly sessionId: string;
  readonly refinementId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly outputType?: RefinementOutputType;
  readonly status: FeedbackSessionStatus;
  readonly currentQuestionId?: string;
  readonly answered: readonly FeedbackAnswer[];
  readonly questionCount: number;
  readonly maxQuestions: typeof MAX_REFINEMENT_QUESTIONS;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}
