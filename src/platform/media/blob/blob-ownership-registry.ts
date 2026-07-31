/**
 * Authoritative blob ownership registry — server-side tenant binding.
 */

import type { BlobOwnershipRecord } from "../contracts/durable-blob-ref";

export class BlobOwnershipRegistry {
  private readonly byKey = new Map<string, BlobOwnershipRecord>();

  register(record: BlobOwnershipRecord): void {
    this.byKey.set(record.storageKey, record);
  }

  get(storageKey: string): BlobOwnershipRecord | undefined {
    return this.byKey.get(storageKey);
  }

  resolveForTenant(storageRef: string, organizationId: string): BlobOwnershipRecord | undefined {
    const key = storageRef.startsWith("blob:") ? storageRef.slice(5) : storageRef;
    const rec = this.byKey.get(key);
    if (!rec) return undefined;
    if (rec.organizationId !== organizationId) return undefined;
    return rec;
  }

  clear(): void {
    this.byKey.clear();
  }
}
