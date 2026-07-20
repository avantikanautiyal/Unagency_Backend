/**
 * Enterprise Data Platform & Persistence.
 *
 * Polyglot persistence behind repository interfaces.
 * Does not modify Business / Intelligence / Provider modules.
 */

export * from "./contracts";
export * from "./interfaces";
export { ALL_ENTITY_COLLECTIONS } from "./repositories/collections";
export { EntityStore } from "./repositories/entity-store";
export { EntityRepository } from "./repositories/entity-repository";
export {
  createMemoryAdapter,
  createPostgresAdapter,
  createMongodbAdapter,
} from "./adapters/create-adapter";
export { PersistenceEngine } from "./engine/persistence-engine";
export { MigrationEngine } from "./migrations/migration-engine";
export { registerBaselineMigrations } from "./migrations/baseline-migrations";
export { TransactionManager } from "./transactions/transaction-manager";
export { InMemoryUnitOfWork } from "./unit-of-work/in-memory-unit-of-work";
export { InMemoryEventStore, InMemoryOutboxStore } from "./events/event-outbox";
export { SnapshotStore, BackupService } from "./backup/backup-service";
export { LocalFieldEncryption } from "./encryption/local-field-encryption";
export { InMemorySearchIndexer } from "./search/in-memory-search-indexer";
export { InMemoryBlobStorage } from "./storage/in-memory-blob-storage";
export { InMemoryCacheStore } from "./redis/in-memory-cache-store";
export { DEFAULT_INDEX_SPECS } from "./indexing/index-specs";
export {
  createPersistencePlatform,
  type PersistencePlatform,
  type CreatePersistenceOptions,
} from "./factories/create-persistence-platform";
