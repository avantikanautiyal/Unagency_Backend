/**
 * Durable blob metadata repository — authoritative tenant ownership across restarts.
 */

import type { BlobOwnershipRecord } from "../../media/contracts/durable-blob-ref";
import { EnterpriseBlobMetadata } from "../../infrastructure/durability/mongo/models/enterprise-blob-metadata.model";

export interface IBlobMetadataRepository {
  register(record: BlobOwnershipRecord): Promise<void>;
  get(storageKey: string): Promise<BlobOwnershipRecord | undefined>;
  resolveForTenant(
    storageKey: string,
    organizationId: string
  ): Promise<BlobOwnershipRecord | undefined>;
}

export class MongoBlobMetadataRepository implements IBlobMetadataRepository {
  async register(record: BlobOwnershipRecord): Promise<void> {
    await EnterpriseBlobMetadata.updateOne(
      { storageKey: record.storageKey },
      { $set: record },
      { upsert: true }
    );
  }

  async get(storageKey: string): Promise<BlobOwnershipRecord | undefined> {
    const doc = await EnterpriseBlobMetadata.findOne({ storageKey }).lean();
    return doc ? (doc as unknown as BlobOwnershipRecord) : undefined;
  }

  async resolveForTenant(
    storageKey: string,
    organizationId: string
  ): Promise<BlobOwnershipRecord | undefined> {
    const doc = await EnterpriseBlobMetadata.findOne({ storageKey, organizationId }).lean();
    return doc ? (doc as unknown as BlobOwnershipRecord) : undefined;
  }
}

export class InMemoryBlobMetadataRepository implements IBlobMetadataRepository {
  private readonly byKey = new Map<string, BlobOwnershipRecord>();

  async register(record: BlobOwnershipRecord): Promise<void> {
    this.byKey.set(record.storageKey, record);
  }

  async get(storageKey: string): Promise<BlobOwnershipRecord | undefined> {
    return this.byKey.get(storageKey);
  }

  async resolveForTenant(
    storageKey: string,
    organizationId: string
  ): Promise<BlobOwnershipRecord | undefined> {
    const rec = this.byKey.get(storageKey);
    if (!rec || rec.organizationId !== organizationId) return undefined;
    return rec;
  }

  clear(): void {
    this.byKey.clear();
  }
}
