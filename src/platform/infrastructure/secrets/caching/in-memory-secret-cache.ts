/**
 * In-memory secret cache — Redis-ready interface later without caller changes.
 */

import type { ISecretCache } from "../interfaces/secrets";
import type { EncryptedBlob } from "../contracts/secret";
import { DEFAULT_CACHE_TTL_MS } from "../constants";

interface CacheEntry {
  readonly blob: EncryptedBlob;
  readonly expiresAtMs: number;
}

export class InMemorySecretCache implements ISecretCache {
  private readonly map = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly clockMs: () => number = () => Date.now()) {}

  get(key: string): EncryptedBlob | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (this.clockMs() > entry.expiresAtMs) {
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.blob;
  }

  set(key: string, value: EncryptedBlob, ttlMs = DEFAULT_CACHE_TTL_MS): void {
    this.map.set(key, {
      blob: value,
      expiresAtMs: this.clockMs() + ttlMs,
    });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.map.size };
  }
}
