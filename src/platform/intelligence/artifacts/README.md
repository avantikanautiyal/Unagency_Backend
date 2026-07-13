# Intelligence Artifact Platform (M3.2)

## Purpose

Define the platform's **canonical immutable intelligence objects** — Git Objects for Intelligence.

This module is **not** storage, a database, or an ORM.

## Pipeline

```
ArtifactInput
  → Identity Builder
  → Metadata Builder
  → Version Resolver
  → Lineage Builder
  → Provenance Builder
  → Signature Generator
  → Validation
  → Artifact Snapshot
  → ArtifactResult
```

## Artifact Types

Context, Knowledge, Prompt, ProviderRequest, ProviderResponse, Execution, Evaluation, Memory, Learning, Workflow, Decision, Human, Brand, Capability, Policy

## Usage

```typescript
import {
  createArtifactEngine,
  ArtifactInputBuilder,
  sampleExecutionArtifactInput,
} from "./platform/intelligence/artifacts";

const engine = createArtifactEngine();
const result = await engine.create(sampleExecutionArtifactInput());

if (result.ok) {
  console.log(result.value.artifact.identity.artifactId);
  console.log(result.value.snapshot.checksum);
}
```

## Boundaries / MUST NOT

- Implement persistence (MongoDB, Redis, S3)
- Import provider SDKs
- Implement Learning Engine or Workflow Engine
- Modify frozen milestones

## Dependencies

`shared`, context/knowledge/prompt-compiler/memory/evaluation/execution-runtime **contracts only**

No provider platform dependency.

See [INTELLIGENCE_ARTIFACT_MODEL.md](./docs/INTELLIGENCE_ARTIFACT_MODEL.md) for the full model.
