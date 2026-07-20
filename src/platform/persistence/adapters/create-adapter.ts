/**
 * Adapter metadata — postgres / mongodb / memory share EntityRepository.
 * Real drivers can replace EntityStore later without changing repository interfaces.
 */

import type { PersistenceDialect } from "../contracts";
import { EntityStore } from "../repositories/entity-store";
import { EntityRepository } from "../repositories/entity-repository";
import type { EntityCollection } from "../contracts";
import type { IEntityRepository, IFieldEncryption } from "../interfaces";
import { ALL_ENTITY_COLLECTIONS } from "../repositories/collections";

export interface PersistenceAdapter {
  readonly dialect: PersistenceDialect;
  readonly store: EntityStore;
  repository<T = Readonly<Record<string, unknown>>>(
    collection: EntityCollection
  ): IEntityRepository<T>;
}

export function createMemoryAdapter(
  nowIso: () => string,
  encryption?: IFieldEncryption
): PersistenceAdapter {
  return createDialectAdapter("memory", nowIso, encryption);
}

export function createPostgresAdapter(
  nowIso: () => string,
  encryption?: IFieldEncryption
): PersistenceAdapter {
  // Driver deferred — same repository contract, dialect-tagged store.
  return createDialectAdapter("postgres", nowIso, encryption);
}

export function createMongodbAdapter(
  nowIso: () => string,
  encryption?: IFieldEncryption
): PersistenceAdapter {
  return createDialectAdapter("mongodb", nowIso, encryption);
}

function createDialectAdapter(
  dialect: PersistenceDialect,
  nowIso: () => string,
  encryption?: IFieldEncryption
): PersistenceAdapter {
  const store = new EntityStore();
  const cache = new Map<EntityCollection, IEntityRepository>();

  // Eagerly register all collections so dialect surfaces are complete.
  for (const c of ALL_ENTITY_COLLECTIONS) {
    cache.set(c, new EntityRepository(c, store, nowIso, encryption, dialect));
  }

  return {
    dialect,
    store,
    repository<T = Readonly<Record<string, unknown>>>(collection: EntityCollection) {
      let repo = cache.get(collection);
      if (!repo) {
        repo = new EntityRepository(collection, store, nowIso, encryption, dialect);
        cache.set(collection, repo);
      }
      return repo as IEntityRepository<T>;
    },
  };
}
