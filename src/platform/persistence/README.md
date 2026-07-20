# Enterprise Data Platform & Persistence

Production-ready persistence architecture behind repository interfaces.

**Does not redesign** Business Platform, Intelligence OS, Providers, or Infrastructure.

## Usage

```ts
import { createPersistencePlatform } from "./index";

const { engine } = createPersistencePlatform({ dialect: "memory" });

await engine.repository("organizations").save("org_1", { name: "Acme" }, {
  organizationId: "org_1",
});

await engine.migrations().migrate("development");
const bak = await engine.backup().fullBackup();
```

Switch dialect without changing call sites:

```ts
createPersistencePlatform({ dialect: "postgres" });
createPersistencePlatform({ dialect: "mongodb" });
```

## Docs

1. [Architecture Review](./docs/ARCHITECTURE_REVIEW.md)
2. [Persistence Architecture](./docs/PERSISTENCE_ARCHITECTURE.md)
3. [Repository Model](./docs/REPOSITORY_MODEL.md)
4. [Entity Relationship Model](./docs/ENTITY_RELATIONSHIP_MODEL.md)
5. [Migration Guide](./docs/MIGRATION_GUIDE.md)
6. [Transaction Model](./docs/TRANSACTION_MODEL.md)
7. [Backup & Restore Model](./docs/BACKUP_RESTORE_MODEL.md)
8. [Data Lifecycle Model](./docs/DATA_LIFECYCLE_MODEL.md)
9. [Dependency Graph](./docs/DEPENDENCY_GRAPH.md)
10. [Unit Tests](./docs/UNIT_TESTS.md)
11. [Integration Tests](./docs/INTEGRATION_TESTS.md)
12. [ACP Report](./docs/ACP_REPORT.md)

## Non-goals

No live Postgres/Mongo/Redis/OpenSearch drivers in this milestone.
No React Native / Web. No frozen-module redesign.
