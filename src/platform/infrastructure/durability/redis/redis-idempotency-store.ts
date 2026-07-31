/**
 * Redis-backed idempotency store.
 */

import type { IdempotencyRecord, IIdempotencyStore } from "../interfaces/execution-store-ports";
import type { KvClient } from "./shared-memory-kv";

const DEFAULT_TTL_SECONDS = 86_400;

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(
    private readonly redis: KvClient,
    private readonly keyPrefix = "enterprise:idem:"
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async get(tenantScopedKey: string): Promise<IdempotencyRecord | undefined> {
    const raw = await this.redis.get(this.keyPrefix + tenantScopedKey);
    if (!raw) return undefined;
    return JSON.parse(raw) as IdempotencyRecord;
  }

  async set(
    tenantScopedKey: string,
    record: IdempotencyRecord,
    ttlSeconds = DEFAULT_TTL_SECONDS
  ): Promise<void> {
    await this.redis.set(
      this.keyPrefix + tenantScopedKey,
      JSON.stringify(record),
      "EX",
      ttlSeconds
    );
  }
}

export class UnavailableIdempotencyStore implements IIdempotencyStore {
  isAvailable(): boolean {
    return false;
  }

  async get(): Promise<IdempotencyRecord | undefined> {
    throw new Error("idempotency store unavailable");
  }

  async set(): Promise<void> {
    throw new Error("idempotency store unavailable");
  }
}
