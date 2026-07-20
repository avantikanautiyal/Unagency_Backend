/**
 * Dialect-agnostic entity repository with optimistic concurrency.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import type {
  EntityCollection,
  PersistedEntity,
  RepositoryQuery,
  WriteOptions,
} from "../contracts";
import type { IEntityRepository, IFieldEncryption } from "../interfaces";
import type { EntityStore } from "./entity-store";

function concurrencyConflict(message: string, metadata?: Record<string, unknown>) {
  return failure(new ValidationError(message, { ...metadata, conflict: true }));
}

export class EntityRepository<TPayload = Readonly<Record<string, unknown>>>
  implements IEntityRepository<TPayload>
{
  constructor(
    readonly collection: EntityCollection,
    private readonly store: EntityStore,
    private readonly nowIso: () => string,
    private readonly encryption?: IFieldEncryption,
    private readonly dialectTag: string = "memory"
  ) {}

  async get(id: string): Promise<Result<PersistedEntity<TPayload> | undefined>> {
    const row = this.store.table(this.collection).get(id);
    if (!row || row.deletedAt) return success(undefined);
    return success(this.decryptRow(row as PersistedEntity<TPayload>));
  }

  async list(
    query: RepositoryQuery = {}
  ): Promise<Result<readonly PersistedEntity<TPayload>[]>> {
    let rows = [...this.store.table(this.collection).values()];
    if (!query.includeDeleted) rows = rows.filter((r) => !r.deletedAt);
    if (query.organizationId) {
      rows = rows.filter((r) => r.organizationId === query.organizationId);
    }
    if (query.ids?.length) {
      const set = new Set(query.ids);
      rows = rows.filter((r) => set.has(r.id));
    }
    const offset = query.offset ?? 0;
    const limit = query.limit ?? rows.length;
    const slice = rows.slice(offset, offset + limit).map((r) =>
      this.decryptRow(r as PersistedEntity<TPayload>)
    );
    return success(slice);
  }

  async save(
    id: string,
    payload: TPayload,
    options: WriteOptions & { organizationId?: string } = {}
  ): Promise<Result<PersistedEntity<TPayload>>> {
    if (!id?.trim()) return failure(new ValidationError("id required"));
    const table = this.store.table(this.collection);
    const existing = table.get(id);

    if (existing && !existing.deletedAt && options.expectedVersion !== undefined) {
      if (existing.version !== options.expectedVersion) {
        return concurrencyConflict("optimistic concurrency conflict", {
          id,
          expected: options.expectedVersion,
          actual: existing.version,
          dialect: this.dialectTag,
        }) as Result<PersistedEntity<TPayload>>;
      }
    }

    if (!existing && options.expectedVersion !== undefined && options.expectedVersion !== 0) {
      return failure(new NotFoundError("entity not found for update"));
    }

    const encryptedFields = options.encryptFields ?? [];
    let storedPayload = payload as Record<string, unknown>;
    if (encryptedFields.length && this.encryption) {
      storedPayload = { ...(payload as object) } as Record<string, unknown>;
      for (const field of encryptedFields) {
        const val = storedPayload[field];
        if (typeof val === "string") {
          const enc = this.encryption.encrypt(val);
          if (!enc.ok) return enc as never;
          storedPayload[field] = enc.value;
        }
      }
    }

    const now = this.nowIso();
    const entity: PersistedEntity<TPayload> = {
      id,
      collection: this.collection,
      payload: storedPayload as TPayload,
      version: existing && !existing.deletedAt ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      organizationId: options.organizationId ?? existing?.organizationId,
      encryptedFields: encryptedFields.length ? encryptedFields : existing?.encryptedFields,
    };
    table.set(id, entity as PersistedEntity);
    return success(this.decryptRow(entity));
  }

  async delete(id: string, options: WriteOptions = {}): Promise<Result<void>> {
    const table = this.store.table(this.collection);
    const existing = table.get(id);
    if (!existing || existing.deletedAt) return failure(new NotFoundError("entity not found"));
    if (options.expectedVersion !== undefined && existing.version !== options.expectedVersion) {
      return concurrencyConflict("optimistic concurrency conflict", {
        id,
        expected: options.expectedVersion,
        actual: existing.version,
      }) as Result<void>;
    }
    table.set(id, {
      ...existing,
      deletedAt: this.nowIso(),
      updatedAt: this.nowIso(),
      version: existing.version + 1,
    });
    return success(undefined);
  }

  private decryptRow(row: PersistedEntity<TPayload>): PersistedEntity<TPayload> {
    if (!row.encryptedFields?.length || !this.encryption) return row;
    const payload = { ...(row.payload as object) } as Record<string, unknown>;
    for (const field of row.encryptedFields) {
      const val = payload[field];
      if (typeof val === "string" && val.startsWith("enc:")) {
        const dec = this.encryption.decrypt(val);
        if (dec.ok) payload[field] = dec.value;
      }
    }
    return { ...row, payload: payload as TPayload };
  }
}
