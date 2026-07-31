/**
 * Mongo-backed durable performance evidence store (M9.5H).
 */

import type { PerformanceEvidence } from "../contracts/performance-evidence";
import type {
  IModelPerformanceStore,
  PerformanceQuery,
} from "../interfaces/model-performance-store";
import { EnterpriseModelPerformanceEvidence } from "../../../../../infrastructure/durability/mongo/models/enterprise-model-performance-evidence.model";

export class MongoModelPerformanceStore implements IModelPerformanceStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoModelPerformanceStore.indexesReady) {
      MongoModelPerformanceStore.indexesReady =
        EnterpriseModelPerformanceEvidence.createIndexes().then(() => undefined);
    }
    return MongoModelPerformanceStore.indexesReady;
  }

  async record(evidence: PerformanceEvidence): Promise<void> {
    await this.recordIdempotent(evidence);
  }

  async recordIdempotent(
    evidence: PerformanceEvidence
  ): Promise<"inserted" | "duplicate"> {
    await MongoModelPerformanceStore.ensureIndexes();
    try {
      await EnterpriseModelPerformanceEvidence.create({ ...evidence });
      return "inserted";
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) return "duplicate";
      throw err;
    }
  }

  async getByAttemptId(attemptId: string): Promise<PerformanceEvidence | undefined> {
    const doc = await EnterpriseModelPerformanceEvidence.findOne({ attemptId }).lean();
    return doc ? (doc as unknown as PerformanceEvidence) : undefined;
  }

  async query(query: PerformanceQuery): Promise<readonly PerformanceEvidence[]> {
    await MongoModelPerformanceStore.ensureIndexes();

    const filter: Record<string, unknown> = {};

    if (query.organizationId) {
      filter.organizationId = query.organizationId;
    } else if (!query.globalOnly) {
      return [];
    }

    if (query.providerId) filter.providerId = query.providerId;
    if (query.modelId) filter.modelId = query.modelId;
    if (query.capabilityId) filter.capabilityId = query.capabilityId;
    if (query.success !== undefined) filter.success = query.success;

    if (query.sinceIso || query.untilIso) {
      filter.completedAt = {
        ...(query.sinceIso ? { $gte: query.sinceIso } : {}),
        ...(query.untilIso ? { $lte: query.untilIso } : {}),
      };
    }

    const limit = query.limit ?? 500;
    const docs = await EnterpriseModelPerformanceEvidence.find(filter)
      .sort({ completedAt: -1 })
      .limit(limit)
      .lean();

    return docs as unknown as PerformanceEvidence[];
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
    await MongoModelPerformanceStore.ensureIndexes();
    const feedbackEligible = provenance?.feedbackEligible === true;
    const $set: Record<string, unknown> = {
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
    if (evaluationDimensions) $set.evaluationDimensions = evaluationDimensions;
    if (feedbackEligible && evaluationScore != null) {
      $set.evaluationScore = evaluationScore;
    }
    const update: Record<string, unknown> = { $set };
    if (!feedbackEligible || evaluationScore == null) {
      update.$unset = { evaluationScore: "" };
    }
    const res = await EnterpriseModelPerformanceEvidence.updateOne(
      { attemptId, success: true },
      update
    );
    return (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
  }
}
