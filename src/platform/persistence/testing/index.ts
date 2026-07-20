/**
 * Persistence testing helpers.
 */

import {
  createPersistencePlatform,
  type CreatePersistenceOptions,
  type PersistencePlatform,
} from "../factories/create-persistence-platform";

export function deterministicPersistenceHelpers() {
  let id = 0;
  let ms = 10_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 11),
  };
}

export function setupPersistence(
  options: CreatePersistenceOptions = {}
): PersistencePlatform {
  const h = deterministicPersistenceHelpers();
  return createPersistencePlatform({
    createId: h.createId,
    nowIso: h.nowIso,
    clockMs: h.clockMs,
    ...options,
  });
}
