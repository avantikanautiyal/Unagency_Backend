# Dependency Graph

```
PersistencePlatform
 └─ PersistenceEngine
     ├─ PersistenceAdapter (memory | postgres | mongodb)
     │    └─ EntityRepository → EntityStore
     ├─ MigrationEngine
     ├─ TransactionManager → UnitOfWork
     ├─ EventStore + OutboxStore
     ├─ SnapshotStore + BackupService → BlobStorage
     ├─ SearchIndexer
     ├─ CacheStore (Redis interface)
     └─ FieldEncryption
```

Frozen modules are **not** dependents inside this package.
Composition roots may inject `IPersistenceEngine` into Business/API later without redesign.
