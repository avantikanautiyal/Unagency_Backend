/**
 * In-memory memory store — no Redis/Mongo/vector DBs.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  MemoryRecord,
  MemoryRequest,
} from "../contracts/memory-models";
import { MemoryNotFoundError } from "../errors";
import type { IMemoryStore } from "../interfaces/memory-ports";

export class InMemoryMemoryStore implements IMemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  async save(record: MemoryRecord): Promise<Result<MemoryRecord>> {
    this.records.set(record.id, record);
    return success(record);
  }

  async get(id: string): Promise<Result<MemoryRecord>> {
    const record = this.records.get(id);
    if (!record) {
      return failure(new MemoryNotFoundError("Memory record not found", { id }));
    }
    return success(record);
  }

  async list(request?: MemoryRequest): Promise<Result<readonly MemoryRecord[]>> {
    let items = [...this.records.values()];

    if (request) {
      items = items.filter((record) => matchesRequest(record, request));
    }

    if (request?.limit !== undefined) {
      items = items.slice(0, request.limit);
    }

    return success(items);
  }

  async delete(id: string): Promise<Result<void>> {
    if (!this.records.has(id)) {
      return failure(new MemoryNotFoundError("Memory record not found", { id }));
    }
    this.records.delete(id);
    return success(undefined);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

function matchesRequest(record: MemoryRecord, request: MemoryRequest): boolean {
  if (
    String(record.identity.organizationId) !==
    String(request.identity.organizationId)
  ) {
    return false;
  }
  if (
    String(record.identity.workspaceId) !== String(request.identity.workspaceId)
  ) {
    return false;
  }
  if (request.scope && record.scope.kind !== request.scope.kind) {
    return false;
  }
  if (request.scope && record.scope.scopeId !== request.scope.scopeId) {
    return false;
  }
  if (
    request.classifications?.length &&
    !request.classifications.includes(record.classification)
  ) {
    return false;
  }
  if (!request.includeDeleted && record.lifecycleState === "deleted") {
    return false;
  }
  if (request.from) {
    const from = Date.parse(request.from);
    const created = Date.parse(record.metadata.createdAt);
    if (Number.isFinite(from) && created < from) return false;
  }
  if (request.to) {
    const to = Date.parse(request.to);
    const created = Date.parse(record.metadata.createdAt);
    if (Number.isFinite(to) && created > to) return false;
  }
  return true;
}

/** Future store ports — interfaces only, not implemented. */
export type FutureMemoryStoreKind =
  | "mongo"
  | "redis"
  | "vector"
  | "blob";
