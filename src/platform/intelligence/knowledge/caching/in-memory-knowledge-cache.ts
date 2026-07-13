/**
 * In-memory knowledge cache — no Redis.
 */

import type { KnowledgeSnapshot } from "../contracts/knowledge-models";
import type { IKnowledgeCache } from "../interfaces/knowledge-ports";

interface CacheEntry {
  readonly snapshot: KnowledgeSnapshot;
  readonly expiresAt?: number;
}

export class InMemoryKnowledgeCache implements IKnowledgeCache {
  private readonly entries = new Map<string, CacheEntry>();

  async get(key: string): Promise<KnowledgeSnapshot | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.snapshot;
  }

  async set(
    key: string,
    snapshot: KnowledgeSnapshot,
    ttlSeconds?: number
  ): Promise<void> {
    this.entries.set(key, {
      snapshot,
      expiresAt:
        ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
