/**
 * Short-lived in-process cache for expensive admin aggregates.
 */

const DEFAULT_TTL_MS = Number(process.env.ADMIN_METRICS_CACHE_TTL_MS ?? 120_000);

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

export function adminCacheKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts);
}

export function readAdminCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeAdminCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): T {
  store.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

export function invalidateAdminCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(prefix)) store.delete(key);
  }
}
