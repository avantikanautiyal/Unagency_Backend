/**
 * Mongo-backed provider operation store — atomic claim + submission uniqueness.
 */

import type { ProviderOperationRecord } from "../contracts/provider-operation";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import {
  canTransitionProviderOperation,
  isTerminalProviderOperationState,
} from "../contracts/provider-operation-state";
import { sanitizeOperationForPersistence } from "../persistence/sanitize-operation-record";
import { EnterpriseProviderOperation } from "../../../../infrastructure/durability/mongo/models/enterprise-provider-operation.model";

const POLLABLE_STATES = ["pending", "submitted", "completed", "result_ingesting"] as const;

function toRecord(doc: Record<string, unknown>): ProviderOperationRecord {
  const usageRecorded = Boolean(doc.usageRecorded);
  const safeMetadata = (doc.safeMetadata as Record<string, unknown> | undefined) ?? {};
  return {
    ...(doc as unknown as ProviderOperationRecord),
    safeMetadata: usageRecorded
      ? { ...safeMetadata, usageRecorded: true }
      : safeMetadata,
  };
}

function toDoc(record: ProviderOperationRecord): Record<string, unknown> {
  const sanitized = sanitizeOperationForPersistence(record);
  const usageRecorded = Boolean(sanitized.safeMetadata?.usageRecorded);
  return {
    ...sanitized,
    usageRecorded,
    version: ((sanitized as { version?: number }).version ?? 0) + 1,
  };
}

export class MongoProviderOperationStore implements IProviderOperationStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoProviderOperationStore.indexesReady) {
      MongoProviderOperationStore.indexesReady = EnterpriseProviderOperation.createIndexes().then(
        () => undefined
      );
    }
    return MongoProviderOperationStore.indexesReady;
  }

  async create(record: ProviderOperationRecord): Promise<void> {
    await MongoProviderOperationStore.ensureIndexes();
    const doc = toDoc(record);
    try {
      await EnterpriseProviderOperation.create(doc);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new Error(`duplicate provider operation submissionKey: ${record.submissionKey}`);
      }
      throw err;
    }
  }

  async get(operationId: string): Promise<ProviderOperationRecord | undefined> {
    const doc = await EnterpriseProviderOperation.findOne({ operationId }).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
  }

  async getBySubmissionKey(submissionKey: string): Promise<ProviderOperationRecord | undefined> {
    const doc = await EnterpriseProviderOperation.findOne({ submissionKey }).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
  }

  async getByExecutionId(executionId: string): Promise<ProviderOperationRecord | undefined> {
    const doc = await EnterpriseProviderOperation.findOne({ executionId })
      .sort({ createdAt: -1 })
      .lean();
    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
  }

  async listByExecutionId(executionId: string): Promise<readonly ProviderOperationRecord[]> {
    const docs = await EnterpriseProviderOperation.find({ executionId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => toRecord(d as Record<string, unknown>));
  }

  async update(record: ProviderOperationRecord): Promise<void> {
    const existing = await this.get(record.operationId);
    if (existing) {
      if (
        isTerminalProviderOperationState(existing.state) &&
        existing.state !== record.state
      ) {
        return;
      }
      if (
        existing.state !== record.state &&
        !canTransitionProviderOperation(existing.state, record.state)
      ) {
        return;
      }
    }

    const doc = toDoc(record);
    const usageFlip =
      Boolean(doc.usageRecorded) && !Boolean(existing?.safeMetadata?.usageRecorded);

    if (usageFlip) {
      const updated = await EnterpriseProviderOperation.findOneAndUpdate(
        {
          operationId: record.operationId,
          usageRecorded: { $ne: true },
        },
        { $set: doc },
        { new: true }
      ).lean();
      if (updated) return;
    }

    await EnterpriseProviderOperation.updateOne(
      { operationId: record.operationId },
      { $set: doc },
      { upsert: !existing }
    );
  }

  async listDueForPoll(nowMs: number, limit = 100): Promise<readonly ProviderOperationRecord[]> {
    const nowIso = new Date(nowMs).toISOString();
    const docs = await EnterpriseProviderOperation.find({
      state: { $in: POLLABLE_STATES },
      $and: [
        {
          $or: [{ leaseOwner: null }, { leaseOwner: { $exists: false } }],
        },
        {
          $or: [{ nextPollAt: { $lte: nowIso } }, { nextPollAt: null }, { nextPollAt: { $exists: false } }],
        },
      ],
    })
      .sort({ nextPollAt: 1 })
      .limit(limit)
      .lean();

    return docs.map((d) => toRecord(d as Record<string, unknown>));
  }

  async tryClaim(
    operationId: string,
    workerId: string,
    leaseTtlMs: number,
    nowIso: string,
    nowMs: number
  ): Promise<ProviderOperationRecord | undefined> {
    const leaseExpiresAt = new Date(nowMs + leaseTtlMs).toISOString();
    const nowIsoLease = new Date(nowMs).toISOString();

    const doc = await EnterpriseProviderOperation.findOneAndUpdate(
      {
        operationId,
        state: { $in: POLLABLE_STATES },
        $or: [
          { leaseOwner: null },
          { leaseOwner: { $exists: false } },
          { leaseExpiresAt: { $lte: nowIsoLease } },
        ],
      },
      {
        $set: {
          leaseOwner: workerId,
          leaseExpiresAt,
          updatedAt: nowIso,
        },
      },
      { new: true }
    ).lean();

    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
  }

  async releaseClaim(operationId: string): Promise<void> {
    await EnterpriseProviderOperation.updateOne(
      { operationId },
      {
        $unset: { leaseOwner: "", leaseExpiresAt: "" },
        $set: { updatedAt: new Date().toISOString() },
      }
    );
  }

  async reclaimExpiredLeases(
    nowIso: string,
    nowMs: number
  ): Promise<readonly ProviderOperationRecord[]> {
    const nowIsoLease = new Date(nowMs).toISOString();
    const docs = await EnterpriseProviderOperation.find({
      leaseOwner: { $exists: true, $ne: null },
      leaseExpiresAt: { $lte: nowIsoLease },
    }).lean();

    const reclaimed: ProviderOperationRecord[] = [];
    for (const doc of docs) {
      const updated = await EnterpriseProviderOperation.findOneAndUpdate(
        {
          operationId: doc.operationId,
          leaseOwner: doc.leaseOwner,
          leaseExpiresAt: { $lte: nowIsoLease },
        },
        {
          $unset: { leaseOwner: "", leaseExpiresAt: "" },
          $set: { updatedAt: nowIso },
        },
        { new: true }
      ).lean();
      if (updated) reclaimed.push(toRecord(updated as Record<string, unknown>));
    }
    return reclaimed;
  }
}
