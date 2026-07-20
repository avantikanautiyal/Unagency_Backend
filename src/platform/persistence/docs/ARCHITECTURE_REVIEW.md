# Enterprise Data Platform — Architecture Review

## Verdict

Polyglot persistence under `src/platform/persistence/`. Completely abstracted behind
repository interfaces. **No business / Intelligence / Provider redesign.**

## Strategy

| Store | Role | Status |
|-------|------|--------|
| PostgreSQL | Primary relational dialect | Adapter contract ready |
| MongoDB | Document dialect | Adapter contract ready |
| Memory | Default test/dev dialect | Fully implemented |
| Redis | Cache interface | In-memory TTL (driver deferred) |
| S3-compatible | Blob storage | In-memory blob adapter |
| OpenSearch/ES | Search | Indexer interface only |

## Principle

`IPersistenceEngine.repository(collection)` is the only write/read path for entities.
Changing dialect requires no business logic changes.
