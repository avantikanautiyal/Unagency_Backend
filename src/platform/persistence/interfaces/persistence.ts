/**
 * Persistence platform interfaces — sole contracts consumers depend on.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  BackupArtifact,
  DomainEventRecord,
  EntityCollection,
  MigrationDefinition,
  MigrationEnvironment,
  MigrationRecord,
  OutboxMessage,
  PersistedEntity,
  RepositoryQuery,
  RestorePoint,
  SearchIndexDocument,
  SeedDefinition,
  SnapshotRecord,
  WriteOptions,
  PersistenceDialect,
} from "../contracts";

export interface IEntityRepository<TPayload = Readonly<Record<string, unknown>>> {
  readonly collection: EntityCollection;
  get(id: string): Promise<Result<PersistedEntity<TPayload> | undefined>>;
  list(query?: RepositoryQuery): Promise<Result<readonly PersistedEntity<TPayload>[]>>;
  save(
    id: string,
    payload: TPayload,
    options?: WriteOptions & { organizationId?: string }
  ): Promise<Result<PersistedEntity<TPayload>>>;
  delete(id: string, options?: WriteOptions): Promise<Result<void>>;
}

export interface IUnitOfWork {
  begin(): Promise<Result<void>>;
  commit(): Promise<Result<void>>;
  rollback(): Promise<Result<void>>;
  isActive(): boolean;
  /** Register an in-transaction side effect. */
  register(work: () => Promise<void> | void): void;
}

export interface ITransactionManager {
  runInTransaction<T>(fn: (uow: IUnitOfWork) => Promise<Result<T>>): Promise<Result<T>>;
}

export interface IMigrationEngine {
  register(migration: MigrationDefinition): Result<void>;
  migrate(environment: MigrationEnvironment, targetVersion?: number): Promise<Result<readonly MigrationRecord[]>>;
  rollback(environment: MigrationEnvironment, steps?: number): Promise<Result<readonly MigrationRecord[]>>;
  applied(environment: MigrationEnvironment): Result<readonly MigrationRecord[]>;
  seed(environment: MigrationEnvironment, seeds: readonly SeedDefinition[]): Promise<Result<{ inserted: number }>>;
}

export interface IOutboxStore {
  enqueue(event: DomainEventRecord): Promise<Result<OutboxMessage>>;
  listPending(limit?: number): Promise<Result<readonly OutboxMessage[]>>;
  markPublished(outboxId: string): Promise<Result<void>>;
  markFailed(outboxId: string): Promise<Result<void>>;
}

export interface IEventStore {
  append(event: DomainEventRecord): Promise<Result<void>>;
  listByAggregate(aggregateType: string, aggregateId: string): Promise<Result<readonly DomainEventRecord[]>>;
  replay(fromEventId?: string): Promise<Result<readonly DomainEventRecord[]>>;
}

export interface ISnapshotStore {
  create(collections: readonly EntityCollection[], kind?: SnapshotRecord["kind"]): Promise<Result<SnapshotRecord>>;
  get(snapshotId: string): Promise<Result<SnapshotRecord | undefined>>;
  list(): Promise<Result<readonly SnapshotRecord[]>>;
}

export interface IBackupService {
  fullBackup(): Promise<Result<BackupArtifact>>;
  incrementalBackup(baseBackupId: string): Promise<Result<BackupArtifact>>;
  createRestorePoint(backupId: string, label: string): Promise<Result<RestorePoint>>;
  restore(restorePointId: string): Promise<Result<{ restoredEntities: number }>>;
  exportAll(): Promise<Result<{ exportId: string; payload: unknown }>>;
  importAll(payload: unknown): Promise<Result<{ imported: number }>>;
}

export interface IFieldEncryption {
  encrypt(plaintext: string): Result<string>;
  decrypt(ciphertext: string): Result<string>;
}

export interface ISearchIndexer {
  index(doc: Omit<SearchIndexDocument, "indexedAt">): Promise<Result<SearchIndexDocument>>;
  remove(indexName: string, documentId: string): Promise<Result<void>>;
  search(indexName: string, query: string, organizationId?: string): Promise<Result<readonly SearchIndexDocument[]>>;
}

export interface BlobPutStreamOptions {
  readonly contentType?: string;
  readonly maxBytes?: number;
}

export interface IBlobStorage {
  put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number; checksum?: string }>>;
  /** Stream upload — avoids loading large media into memory. Optional for backwards compatibility. */
  putStream?(
    key: string,
    stream: AsyncIterable<Uint8Array>,
    options?: BlobPutStreamOptions
  ): Promise<Result<{ key: string; size: number; checksum?: string }>>;
  get(key: string): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>>;
  delete(key: string): Promise<Result<void>>;
}

export interface ICacheStore {
  get(key: string): Promise<Result<string | undefined>>;
  set(key: string, value: string, ttlMs?: number): Promise<Result<void>>;
  del(key: string): Promise<Result<void>>;
}

export interface IPersistenceEngine {
  readonly dialect: PersistenceDialect;
  repository<T = Readonly<Record<string, unknown>>>(
    collection: EntityCollection
  ): IEntityRepository<T>;
  unitOfWork(): IUnitOfWork;
  transactions(): ITransactionManager;
  migrations(): IMigrationEngine;
  outbox(): IOutboxStore;
  events(): IEventStore;
  snapshots(): ISnapshotStore;
  backup(): IBackupService;
  search(): ISearchIndexer;
  blobs(): IBlobStorage;
  cache(): ICacheStore;
  encryption(): IFieldEncryption;
}
