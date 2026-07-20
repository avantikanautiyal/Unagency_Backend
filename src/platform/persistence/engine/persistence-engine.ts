/**
 * Persistence engine — facade over repositories, UoW, migrations, events, backup.
 */

import type { EntityCollection, PersistenceDialect } from "../contracts";
import type {
  IBackupService,
  IBlobStorage,
  ICacheStore,
  IEntityRepository,
  IEventStore,
  IFieldEncryption,
  IMigrationEngine,
  IOutboxStore,
  IPersistenceEngine,
  ISearchIndexer,
  ISnapshotStore,
  ITransactionManager,
  IUnitOfWork,
} from "../interfaces";
import type { PersistenceAdapter } from "../adapters/create-adapter";
import { InMemoryUnitOfWork } from "../unit-of-work/in-memory-unit-of-work";
import { TransactionManager } from "../transactions/transaction-manager";
import { MigrationEngine } from "../migrations/migration-engine";
import { InMemoryEventStore, InMemoryOutboxStore } from "../events/event-outbox";
import { SnapshotStore } from "../backup/backup-service";
import { BackupService } from "../backup/backup-service";

export interface PersistenceEngineDeps {
  readonly adapter: PersistenceAdapter;
  readonly migrations: IMigrationEngine;
  readonly outbox: IOutboxStore;
  readonly events: IEventStore;
  readonly snapshots: ISnapshotStore;
  readonly backup: IBackupService;
  readonly search: ISearchIndexer;
  readonly blobs: IBlobStorage;
  readonly cache: ICacheStore;
  readonly encryption: IFieldEncryption;
  readonly transactions: ITransactionManager;
}

export class PersistenceEngine implements IPersistenceEngine {
  readonly dialect: PersistenceDialect;

  constructor(private readonly deps: PersistenceEngineDeps) {
    this.dialect = deps.adapter.dialect;
  }

  repository<T = Readonly<Record<string, unknown>>>(
    collection: EntityCollection
  ): IEntityRepository<T> {
    return this.deps.adapter.repository<T>(collection);
  }

  unitOfWork(): IUnitOfWork {
    return new InMemoryUnitOfWork();
  }

  transactions(): ITransactionManager {
    return this.deps.transactions;
  }

  migrations(): IMigrationEngine {
    return this.deps.migrations;
  }

  outbox(): IOutboxStore {
    return this.deps.outbox;
  }

  events(): IEventStore {
    return this.deps.events;
  }

  snapshots(): ISnapshotStore {
    return this.deps.snapshots;
  }

  backup(): IBackupService {
    return this.deps.backup;
  }

  search(): ISearchIndexer {
    return this.deps.search;
  }

  blobs(): IBlobStorage {
    return this.deps.blobs;
  }

  cache(): ICacheStore {
    return this.deps.cache;
  }

  encryption(): IFieldEncryption {
    return this.deps.encryption;
  }

  /** Internal: shared entity store for advanced ops */
  get adapter(): PersistenceAdapter {
    return this.deps.adapter;
  }
}
