# Integration Tests

| Flow | Status |
|------|--------|
| Persist → soft-delete → list includeDeleted | PASS |
| Full backup → delete → restore point → restore | PASS |
| Outbox enqueue → mark published → event replay | PASS |
| postgres/mongodb dialect repository parity | PASS |
| Seed via migration engine into repositories | PASS |

No live PostgreSQL/MongoDB/Redis/OpenSearch processes required in this milestone.
