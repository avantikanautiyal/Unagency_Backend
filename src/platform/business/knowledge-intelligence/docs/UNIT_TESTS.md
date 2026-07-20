# Knowledge Intelligence — Unit Tests

Suite: `tests/platform/business/knowledge-intelligence/knowledge-intelligence.test.ts`

| Case | Coverage |
|------|----------|
| Entity graph | Brand Brain projection yields typed entities/edges |
| Relationship traversal | Related, shortest path, neighborhood |
| Context assembly | Structured package + metadata flags |
| Org uniqueness | Different histories → different packages |
| Evidence ranking / explainability | Scores + 1:1 why items |
| Versioning / graph updates | Upsert entity/rel → snapshots + compare |
| Missing graph | assembleContext fails closed |
