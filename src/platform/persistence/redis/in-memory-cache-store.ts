/**
 * Redis cache interface — connector deferred; in-memory TTL map.
 */

import { success, type Result } from "../../intelligence/shared/result";
import type { ICacheStore } from "../interfaces";

export class InMemoryCacheStore implements ICacheStore {
  private readonly map = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly clockMs: () => number = () => Date.now()) {}

  async get(key: string): Promise<Result<string | undefined>> {
    const e = this.map.get(key);
    if (!e) return success(undefined);
    if (e.expiresAt != null && this.clockMs() >= e.expiresAt) {
      this.map.delete(key);
      return success(undefined);
    }
    return success(e.value);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<Result<void>> {
    this.map.set(key, {
      value,
      expiresAt: ttlMs != null ? this.clockMs() + ttlMs : undefined,
    });
    return success(undefined);
  }

  async del(key: string): Promise<Result<void>> {
    this.map.delete(key);
    return success(undefined);
  }
}
