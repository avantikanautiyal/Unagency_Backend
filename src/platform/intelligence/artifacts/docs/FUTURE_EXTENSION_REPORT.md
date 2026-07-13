# Future Extension Report — M3.2 Intelligence Artifact Platform

## Near-term

| Extension | Approach |
|-----------|----------|
| Blob/S3 persistence | External `IArtifactStore` adapter consuming snapshots |
| Mongo/Redis indexes | Implement `IArtifactIndex` backends |
| Cryptographic signatures | Extend `IArtifactSignatureEngine` with HSM/KMS |
| Binary serialization | Add format behind `IArtifactSerializer` — no protobuf in M3.2 |
| Plugin artifact types | `IArtifactRegistry.register()` at bootstrap |

## Indexing

Future index kinds (interfaces defined):

- Metadata index — tag/type/org queries
- Relationship index — graph traversal
- Lineage index — ancestor/descendant walks
- Temporal index — time-range queries
- Semantic index — embedding-backed search (external)

## Integration

```
Module produces payload
  → ArtifactInput
  → IArtifactEngine.create()
  → ArtifactSnapshot
  → External persistence (future)
  → Downstream module reads snapshot
```

## Learning Engine

`LearningArtifact` payload contract is ready. Learning Engine (future) will:

1. Consume `EvaluationArtifact` and `ExecutionArtifact` snapshots
2. Emit `LearningArtifact` via `IArtifactEngine`
3. Never mutate source artifacts

## Provider integration

`ProviderRequestArtifact` and `ProviderResponseArtifact` include optional `providerId` / `modelId` placeholders. Provider Platform adapters (future) wrap SDK I/O as artifacts without coupling this module to SDKs.

## Out of scope

- ORM mappings
- HTTP artifact APIs
- Workflow execution
- Agent runtime
