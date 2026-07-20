# Persistence Architecture

```
Consumers (Business / API / OS composition roots)
        ↓  repository interfaces only
 PersistenceEngine
  ├─ PersistenceAdapter (memory | postgres | mongodb)
  │    └─ EntityRepository × N collections
  ├─ TransactionManager + UnitOfWork
  ├─ MigrationEngine
  ├─ EventStore + Outbox
  ├─ SnapshotStore + BackupService
  ├─ FieldEncryption
  ├─ SearchIndexer
  ├─ BlobStorage
  └─ CacheStore
```

Optimistic concurrency via `PersistedEntity.version` + `expectedVersion` on save/delete.
Soft deletes via `deletedAt`.
