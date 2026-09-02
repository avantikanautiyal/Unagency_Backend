/**
 * In-memory performance evidence store — tests + non-durable mode.
 */

import type { PerformanceEvidence } from "../contracts/performance-evidence";
import type {
  IModelPerformanceStore,
  PerformanceQuery,
} from "../interfaces/model-performance-store";

export class InMemoryModelPerformanceStore implements IModelPerformanceStore {
  private readonly byAttempt = new Map<string, PerformanceEvidence>();
  private readonly ordered: PerformanceEvidence[] = [];

  async record(evidence: PerformanceEvidence): Promise<void> {
    await this.recordIdempotent(evidence);
  }

  async recordIdempotent(
    evidence: PerformanceEvidence
  ): Promise<"inserted" | "duplicate"> {
    if (this.byAttempt.has(evidence.attemptId)) return "duplicate";
    this.byAttempt.set(evidence.attemptId, evidence);
    this.ordered.push(evidence);
    return "inserted";
  }

  async getByAttemptId(attemptId: string): Promise<PerformanceEvidence | undefined> {
    return this.byAttempt.get(attemptId);
  }

  async query(query: PerformanceQuery): Promise<readonly PerformanceEvidence[]> {
    let rows = [...this.ordered];

    if (query.organizationId) {
      rows = rows.filter((e) => e.organizationId === query.organizationId);
    } else if (query.globalOnly) {
      // Anonymized global view — return all but callers must not expose org ids cross-tenant.
      // Store still holds orgId for aggregation scoping; query itself is allowed for global metrics.
    } else {
      // Fail closed: refuse unscoped tenant-cross queries without globalOnly.
      return [];
    }

    if (query.providerId) {
      rows = rows.filter((e) => e.providerId === query.providerId);
    }
    if (query.modelId) {
      rows = rows.filter((e) => e.modelId === query.modelId);
    }
    if (query.capabilityId) {
      rows = rows.filter((e) => e.capabilityId === query.capabilityId);
    }
    if (query.success !== undefined) {
      rows = rows.filter((e) => e.success === query.success);
    }
    if (query.sinceIso) {
      rows = rows.filter((e) => e.completedAt >= query.sinceIso!);
    }
    if (query.untilIso) {
      rows = rows.filter((e) => e.completedAt <= query.untilIso!);
    }

    rows.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
    const limit = query.limit ?? 500;
    return rows.slice(0, limit);
  }

  /** Test helper */
  clear(): void {
    this.byAttempt.clear();
    this.ordered.length = 0;
  }

  async attachEvaluation(
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
  ): Promise<boolean> {
    const existing = this.byAttempt.get(attemptId);
    if (!existing || !existing.success) return false;
    const feedbackEligible = provenance?.feedbackEligible === true;
    const updated: PerformanceEvidence = {
      ...existing,
      // Only persist quality score for routing when feedback-eligible.
      evaluationScore:
        feedbackEligible && evaluationScore != null ? evaluationScore : undefined,
      evaluationDimensions: evaluationDimensions ?? existing.evaluationDimensions,
      feedbackEligible,
      evaluationTrust: provenance?.evaluationTrust,
      evaluationMethod: provenance?.evaluationMethod,
      evaluationStatus: provenance?.evaluationStatus,
      judgeId: provenance?.judgeId,
      judgeVersion: provenance?.judgeVersion,
      rubricVersion: provenance?.rubricVersion,
      evaluationExclusionReason: provenance?.evaluationExclusionReason,
      evaluationMetricNamespace: provenance?.evaluationMetricNamespace,
    };
    this.byAttempt.set(attemptId, updated);
    const idx = this.ordered.findIndex((e) => e.attemptId === attemptId);
    if (idx >= 0) this.ordered[idx] = updated;
    return true;
  }

  size(): number {
    return this.ordered.length;
  }
}
