/**
 * Durable model/provider performance evidence store (M9.5H).
 */

import type { PerformanceEvidence } from "../contracts/performance-evidence";

export interface PerformanceQuery {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityId?: string;
  /** When set, only that tenant's evidence. Never cross-tenant. */
  readonly organizationId?: string;
  /** Global/anonymized queries must omit organizationId and set globalOnly. */
  readonly globalOnly?: boolean;
  readonly success?: boolean;
  readonly sinceIso?: string;
  readonly untilIso?: string;
  readonly limit?: number;
}

export interface IModelPerformanceStore {
  record(evidence: PerformanceEvidence): Promise<void>;

  /**
   * Tenant-scoped: requires organizationId.
   * Global aggregates: use globalOnly without organizationId (no raw cross-tenant dumps).
   */
  query(query: PerformanceQuery): Promise<readonly PerformanceEvidence[]>;

  getByAttemptId(attemptId: string): Promise<PerformanceEvidence | undefined>;

  /**
   * Concurrent writers must not create duplicate attempt identities.
   * Second write with same attemptId is a no-op (idempotent).
   */
  recordIdempotent(evidence: PerformanceEvidence): Promise<"inserted" | "duplicate">;

  /**
   * Attach evaluation after judges run (successful attempt only).
   * Only feedbackEligible quality scores should be attached for QUALITY routing.
   */
  attachEvaluation(
    attemptId: string,
    evaluationScore: number | null,
    evaluationDimensions?: Readonly<Record<string, number>>,
    provenance?: {
      readonly feedbackEligible?: boolean;
      readonly evaluationTrust?: PerformanceEvidence["evaluationTrust"];
      readonly evaluationMethod?: PerformanceEvidence["evaluationMethod"];
      readonly evaluationStatus?: PerformanceEvidence["evaluationStatus"];
      readonly judgeId?: string;
      readonly judgeVersion?: string;
      readonly rubricVersion?: string;
      readonly evaluationExclusionReason?: string;
      readonly evaluationMetricNamespace?: string;
    }
  ): Promise<boolean>;
}
