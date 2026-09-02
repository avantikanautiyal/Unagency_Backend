/**
 * Mongo-backed durable execution observability store (finalize-once per executionId).
 */

import { EnterpriseExecutionObservability } from "../../infrastructure/durability/mongo/models/enterprise-execution-observability.model";
import type {
  DurableExecutionObservabilityRecord,
  ExecutionObservabilityFinalizeResult,
  ExecutionObservabilityQuery,
} from "./execution-observability-contract";
import type { IExecutionObservabilityStore } from "./execution-observability-store";

export class MongoExecutionObservabilityStore implements IExecutionObservabilityStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoExecutionObservabilityStore.indexesReady) {
      MongoExecutionObservabilityStore.indexesReady =
        EnterpriseExecutionObservability.createIndexes().then(() => undefined);
    }
    return MongoExecutionObservabilityStore.indexesReady;
  }

  async finalize(
    record: DurableExecutionObservabilityRecord,
  ): Promise<ExecutionObservabilityFinalizeResult> {
    await MongoExecutionObservabilityStore.ensureIndexes();
    try {
      await EnterpriseExecutionObservability.create({ ...record });
      return "inserted";
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) return "duplicate";
      throw err;
    }
  }

  async getByExecutionId(
    executionId: string,
  ): Promise<DurableExecutionObservabilityRecord | undefined> {
    await MongoExecutionObservabilityStore.ensureIndexes();
    const doc = await EnterpriseExecutionObservability.findOne({ executionId }).lean();
    return doc ? (doc as unknown as DurableExecutionObservabilityRecord) : undefined;
  }

  async getByCorrelationId(
    correlationId: string,
    limit = 100,
  ): Promise<readonly DurableExecutionObservabilityRecord[]> {
    await MongoExecutionObservabilityStore.ensureIndexes();
    const docs = await EnterpriseExecutionObservability.find({ correlationId })
      .sort({ finalizedAt: -1 })
      .limit(limit)
      .lean();
    return docs as unknown as DurableExecutionObservabilityRecord[];
  }

  async query(
    query: ExecutionObservabilityQuery,
  ): Promise<readonly DurableExecutionObservabilityRecord[]> {
    await MongoExecutionObservabilityStore.ensureIndexes();
    const filter: Record<string, unknown> = {};
    if (query.organizationId) filter.organizationId = query.organizationId;
    if (query.service) filter.service = query.service;
    if (query.subtype) filter.subtype = query.subtype;
    if (query.outputKind) filter.outputKind = query.outputKind;
    if (query.requestedProviderId) filter.requestedProviderId = query.requestedProviderId;
    if (query.selectedProviderId) filter.selectedProviderId = query.selectedProviderId;
    if (query.actualProviderId) filter.actualProviderId = query.actualProviderId;
    if (query.actualModelId) filter.actualModelId = query.actualModelId;
    if (query.executionStatus) filter.executionStatus = query.executionStatus;
    if (query.integrityStatus) filter.integrityStatus = query.integrityStatus;
    if (query.failureCategory) filter.failureCategory = query.failureCategory;
    if (query.evidenceStatus) filter.evidenceStatus = query.evidenceStatus;
    if (query.evaluationPlaneStatus) {
      filter.evaluationPlaneStatus = query.evaluationPlaneStatus;
    }
    if (query.step2Status) filter.step2Status = query.step2Status;
    if (query.sinceIso || query.untilIso) {
      const finalizedAt: Record<string, string> = {};
      if (query.sinceIso) finalizedAt.$gte = query.sinceIso;
      if (query.untilIso) finalizedAt.$lte = query.untilIso;
      filter.finalizedAt = finalizedAt;
    }
    const docs = await EnterpriseExecutionObservability.find(filter)
      .sort({ finalizedAt: -1 })
      .limit(query.limit ?? 1000)
      .lean();
    return docs as unknown as DurableExecutionObservabilityRecord[];
  }
}
