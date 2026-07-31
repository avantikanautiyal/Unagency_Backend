/**
 * Redis-backed tenant token usage store.
 */

import type { ITenantUsageStore } from "../interfaces/execution-store-ports";
import type { KvClient } from "./shared-memory-kv";

export class RedisTenantUsageStore implements ITenantUsageStore {
  constructor(
    private readonly redis: KvClient,
    private readonly keyPrefix = "enterprise:usage:"
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async getTokensUsed(organizationId: string): Promise<number> {
    const raw = await this.redis.get(this.keyPrefix + organizationId);
    return raw ? Number(raw) : 0;
  }

  async addTokens(organizationId: string, tokens: number): Promise<number> {
    return this.redis.incrby(this.keyPrefix + organizationId, tokens);
  }
}

export class UnavailableTenantUsageStore implements ITenantUsageStore {
  isAvailable(): boolean {
    return false;
  }

  async getTokensUsed(): Promise<number> {
    throw new Error("tenant usage store unavailable");
  }

  async addTokens(): Promise<number> {
    throw new Error("tenant usage store unavailable");
  }
}
