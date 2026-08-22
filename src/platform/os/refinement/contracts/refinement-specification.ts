/**
 * Phase 7 — Machine-readable refinement specification.
 */

import type { FeedbackAnswer } from "./feedback-session";
import type { RefinementOutputType } from "./refinement-request";

export type RefinementPriority = "highest" | "high" | "medium" | "low";

export interface RequestedChange {
  readonly dimension: string;
  readonly signal: string;
  readonly value: string;
  readonly priority: RefinementPriority;
}

export interface RefinementConflict {
  readonly code: string;
  readonly message: string;
  readonly userSignal: string;
  readonly winningConstraint:
    | "SYSTEM_SAFETY"
    | "GOVERNANCE"
    | "OUTPUT_CONTRACT"
    | "BRAND"
    | "EXECUTION";
  readonly resolution: "rejected" | "preserved_mandatory" | "clarification_needed";
}

export interface RefinementSpecification {
  readonly specificationId: string;
  readonly refinementId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly sourceOutputId: string;
  readonly sourceVersion: number;
  readonly refinementVersion: number;
  readonly outputType: RefinementOutputType;
  /** Product brand this refinement should teach (optional — learner may resolve org default). */
  readonly brandId?: string;
  readonly dissatisfactionAreas: readonly string[];
  readonly requestedChanges: readonly RequestedChange[];
  readonly desiredDirection: readonly string[];
  readonly preserveRequirements: readonly string[];
  readonly constraints: readonly string[];
  readonly priorities: readonly { readonly dimension: string; readonly priority: RefinementPriority }[];
  readonly feedbackAnswers: readonly FeedbackAnswer[];
  readonly brandConstraints: readonly string[];
  readonly conflicts: readonly RefinementConflict[];
  readonly replanReason: string;
  readonly createdAt: string;
  readonly version: "1.0.0";
}
