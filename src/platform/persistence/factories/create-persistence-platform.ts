/**
 * Enterprise Data Platform factory.
 * Consumers depend only on IPersistenceEngine / repository interfaces.
 */

import type { PersistenceDialect } from "../contracts";
import {
  createMemoryAdapter,
  createMongodbAdapter,
  createPostgresAdapter,
} from "../adapters/create-adapter";
import { PersistenceEngine } from "../engine/persistence-engine";
import { MigrationEngine } from "../migrations/migration-engine";
import { TransactionManager } from "../transactions/transaction-manager";
import { InMemoryEventStore, InMemoryOutboxStore } from "../events/event-outbox";
import { SnapshotStore, BackupService } from "../backup/backup-service";
import { LocalFieldEncryption } from "../encryption/local-field-encryption";
import { InMemorySearchIndexer } from "../search/in-memory-search-indexer";
import { InMemoryBlobStorage } from "../storage/in-memory-blob-storage";
import { InMemoryCacheStore } from "../redis/in-memory-cache-store";
import type { IPersistenceEngine } from "../interfaces";
import { registerBaselineMigrations } from "../migrations/baseline-migrations";

export interface PersistencePlatform {
  readonly engine: IPersistenceEngine;
}

export interface CreatePersistenceOptions {
  readonly dialect?: PersistenceDialect;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly encryptionKey?: string;
  /** Register baseline schema migrations (default true). */
  readonly registerBaseline?: boolean;
}

export function createPersistencePlatform(
  options: CreatePersistenceOptions = {}
): PersistencePlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let seq = 0;
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${clockMs()}`);

  const encryption = new LocalFieldEncryption(options.encryptionKey);
  const dialect = options.dialect ?? "memory";

  const adapter =
    dialect === "postgres"
      ? createPostgresAdapter(nowIso, encryption)
      : dialect === "mongodb"
        ? createMongodbAdapter(nowIso, encryption)
        : createMemoryAdapter(nowIso, encryption);

  const migrations = new MigrationEngine(nowIso, (c) => adapter.repository(c));
  if (options.registerBaseline !== false) {
    registerBaselineMigrations(migrations);
  }

  const events = new InMemoryEventStore();
  const outbox = new InMemoryOutboxStore(nowIso, createId, events);
  const snapshots = new SnapshotStore(adapter.store, nowIso, createId);
  const blobs = new InMemoryBlobStorage();
  const backup = new BackupService(snapshots, adapter.store, blobs, nowIso, createId);
  const search = new InMemorySearchIndexer(nowIso);
  const cache = new InMemoryCacheStore(clockMs);
  const transactions = new TransactionManager();

  const engine = new PersistenceEngine({
    adapter,
    migrations,
    outbox,
    events,
    snapshots,
    backup,
    search,
    blobs,
    cache,
    encryption,
    transactions,
  });

  return { engine };
}
