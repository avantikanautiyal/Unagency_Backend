/**
 * In-memory Redis-like store for tests — shared across simulated API instances.
 */

export class SharedMemoryKvStore {
  private readonly data = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const row = this.data.get(key);
    if (!row) return null;
    if (row.expiresAt != null && Date.now() > row.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<"OK"> {
    const expiresAt =
      mode === "EX" && ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
    return "OK";
  }

  async incrby(key: string, increment: number): Promise<number> {
    const current = Number((await this.get(key)) ?? 0);
    const next = current + increment;
    await this.set(key, String(next));
    return next;
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  clear(): void {
    this.data.clear();
  }
}

export interface KvClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<unknown>;
  incrby(key: string, increment: number): Promise<number>;
  del(key: string): Promise<number>;
}

export function asKvClient(redis: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
  incrby(key: string, increment: number): Promise<number>;
  del(key: string): Promise<number>;
}): KvClient {
  return redis;
}
