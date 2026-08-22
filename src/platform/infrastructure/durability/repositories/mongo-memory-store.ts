/**
 * Mongo-backed memory store — durable persistence for LIVE mode.
 */

import { Schema, model } from "mongoose";
import { failure, success } from "../../../intelligence/shared/result";
import type { Result } from "../../../intelligence/shared/result";
import type {
  MemoryRecord,
  MemoryRequest,
} from "../../../intelligence/memory/contracts/memory-models";
import { MemoryNotFoundError } from "../../../intelligence/memory/errors";
import type { IMemoryStore } from "../../../intelligence/memory/interfaces/memory-ports";
import { matchesMemoryRequest } from "../../../intelligence/memory/stores/memory-store-filters";

const Mixed = Schema.Types.Mixed;

const memorySchema = new Schema(
  {
    recordId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    scopeKind: { type: String, index: true },
    scopeId: { type: String, index: true },
    classification: { type: String, index: true },
    lifecycleState: { type: String, index: true },
    createdAt: { type: String, index: true },
    record: { type: Mixed, required: true },
  },
  { collection: "enterprise_memory_records" }
);

export const EnterpriseMemoryRecord = model("EnterpriseMemoryRecord", memorySchema);

export class MongoMemoryStore implements IMemoryStore {
  async save(record: MemoryRecord): Promise<Result<MemoryRecord>> {
    await EnterpriseMemoryRecord.updateOne(
      { recordId: record.id },
      {
        $set: {
          recordId: record.id,
          organizationId: String(record.identity.organizationId),
          workspaceId: String(record.identity.workspaceId),
          scopeKind: record.scope.kind,
          scopeId: record.scope.scopeId,
          classification: record.classification,
          lifecycleState: record.lifecycleState,
          createdAt: record.metadata.createdAt,
          record,
        },
      },
      { upsert: true }
    );
    return success(record);
  }

  async get(id: string): Promise<Result<MemoryRecord>> {
    const doc = await EnterpriseMemoryRecord.findOne({ recordId: id }).lean();
    if (!doc) {
      return failure(new MemoryNotFoundError("Memory record not found", { id }));
    }
    return success(doc.record as MemoryRecord);
  }

  async list(request?: MemoryRequest): Promise<Result<readonly MemoryRecord[]>> {
    const filter: Record<string, unknown> = {};
    if (request) {
      filter.organizationId = String(request.identity.organizationId);
      filter.workspaceId = String(request.identity.workspaceId);
      if (request.scope) {
        filter.scopeKind = request.scope.kind;
        filter.scopeId = request.scope.scopeId;
      }
      if (request.classifications?.length === 1) {
        filter.classification = request.classifications[0];
      }
      if (!request.includeDeleted) {
        filter.lifecycleState = { $ne: "deleted" };
      }
    }

    let docs = await EnterpriseMemoryRecord.find(filter).lean();
    let items = docs.map((doc) => doc.record as MemoryRecord);

    if (request) {
      items = items.filter((record) => matchesMemoryRequest(record, request));
    }
    if (request?.limit !== undefined) {
      items = items.slice(0, request.limit);
    }

    return success(items);
  }

  async delete(id: string): Promise<Result<void>> {
    const existing = await EnterpriseMemoryRecord.findOne({ recordId: id }).lean();
    if (!existing) {
      return failure(new MemoryNotFoundError("Memory record not found", { id }));
    }
    await EnterpriseMemoryRecord.deleteOne({ recordId: id });
    return success(undefined);
  }

  async clear(): Promise<void> {
    await EnterpriseMemoryRecord.deleteMany({});
  }
}
