# Intelligence Artifact Model

## What is an Artifact?

An **Artifact** is an immutable, versioned, self-describing intelligence object produced by the UNAGENCY Intelligence Platform. Every major intelligence output — context, knowledge, prompts, execution results, evaluations, memory snapshots, and more — can be represented as an Artifact.

Artifacts are the **canonical language** of the platform. They are provider-independent, storage-agnostic, and designed for lineage and provenance tracking.

## Why Artifacts Exist

Before artifacts, intelligence outputs lived inside module-specific models. That created coupling, inconsistent metadata, and no universal way to answer:

- What was produced?
- Who produced it?
- What did it come from?
- Which version is authoritative?
- Can it be trusted?

Artifacts solve this by providing a **single immutable contract** that all modules speak when exchanging intelligence.

```
Context Engine     → ContextArtifact
Knowledge Engine   → KnowledgeArtifact
Prompt Compiler    → PromptArtifact
Execution Runtime  → ExecutionArtifact
Evaluation Platform→ EvaluationArtifact
Memory Engine      → MemoryArtifact
```

Storage, indexing, and transport are **somebody else's responsibility**.

## Artifact Identity

`ArtifactIdentity` uniquely identifies an artifact within organizational scope:

| Field | Purpose |
|-------|---------|
| `artifactId` | Stable object identifier |
| `type` | Artifact type enum |
| `organizationId` | Tenant boundary |
| `workspaceId` | Workspace boundary |
| `executionId` | Optional execution correlation |
| `sessionId`, `conversationId`, etc. | Optional scope dimensions |

Identity is assigned at creation time and **never changes**.

## Artifact Immutability

**Artifacts never change.**

- Corrections produce **new artifacts** with new versions
- Lifecycle transitions create new logical states but do not mutate historical snapshots
- Downstream modules consume **snapshots**, not live mutable references

This mirrors Git object immutability: content-addressed, append-only intelligence history.

## Artifact Versioning

`ArtifactVersion` supports semantic-style versioning:

```
major.minor.patch+revision
```

Version states: `draft` | `published` | `deprecated` | `archived`

| Operation | Behavior |
|-----------|----------|
| New content | Bump revision or patch |
| Breaking schema change | Bump major |
| Compatible enhancement | Bump minor |

Version resolution is handled by `IArtifactVersionEngine` — no storage required.

## Artifact Lineage

`ArtifactLineage` records **where an artifact sits in the intelligence graph**:

```
parent(s) ──► Artifact ──► child(ren)
                │
         derivedFrom / createdFrom
```

Supported dimensions:

- `parents`, `children`
- `createdFrom`, `derivedFrom`
- `executionId`, `organizationId`, `workspaceId`
- `campaignId`, `projectId`, `taskId`, `conversationId`, `sessionId`

Lineage is built by `IArtifactLineageEngine` at creation time.

## Artifact Provenance

`ArtifactProvenance` records **what created the artifact and through which intelligence path**:

| Source Kind | Example |
|-------------|---------|
| context | Context artifact used |
| knowledge | Knowledge snapshot used |
| prompt | Compiled prompt used |
| provider | Provider request/response (optional placeholder) |
| model | Model identifier (optional placeholder) |
| evaluation | Evaluation report |
| human | Human feedback signal |
| workflow | Workflow step |
| execution | Execution runtime |
| capability | Capability definition |
| policy | Policy artifact |

Provenance includes timestamps, module origin, and optional version map.

## Artifact Lifecycle

```
Created → Validated → Published → Superseded → Archived → Deleted
```

| State | Meaning |
|-------|---------|
| `created` | Newly minted |
| `validated` | Passed validation |
| `published` | Authoritative version |
| `superseded` | Replaced by newer artifact |
| `archived` | Retained but inactive |
| `deleted` | Logical deletion marker |

Transitions are enforced by `IArtifactLifecycleManager`.

## Artifact Signatures

`ArtifactSignature` provides integrity guarantees:

- `canonical_sha256` checksum over canonical JSON
- Placeholder signature for future cryptographic signing
- Tamper detection via checksum verification

Implemented by `IArtifactSignatureEngine`.

## Artifact Relationships

`ArtifactRelationship` models typed edges between artifacts:

- `parent`, `child`, `derived_from`, `created_from`
- `supersedes`, `references`, `depends_on`

Relationships complement lineage with explicit graph edges.

## Artifact Snapshots

`ArtifactSnapshot` is the **downstream consumption unit**:

```
Artifact + Manifest + capturedAt + checksum = Snapshot
```

Every module that reads intelligence should prefer snapshots over raw mutable references.

## How Future Modules Should Use Artifacts

### Producers

1. Build an `ArtifactInput` with typed payload
2. Call `IArtifactEngine.create()`
3. Emit `ArtifactResult` (artifact + snapshot + validation)
4. Hand snapshot to persistence adapter (external)

### Consumers

1. Request `ArtifactSnapshot` by reference
2. Validate signature and manifest checksum
3. Deserialize typed payload
4. Never mutate — create new version if changes needed

### Integration Pattern

```
Module Engine
     ↓
ArtifactInput
     ↓
IArtifactEngine
     ↓
ArtifactSnapshot  ──►  External Store (future)
     ↓
Downstream Module
```

### Rules

- ✅ Use artifacts as the interchange format
- ✅ Include lineage and provenance at creation
- ✅ Version on every material change
- ❌ Do not store artifacts inside module engines
- ❌ Do not bypass artifact model for cross-module communication
- ❌ Do not mutate existing artifacts

## Typed Artifacts

| Type | Payload |
|------|---------|
| `ContextArtifact` | `IntelligenceContext` |
| `KnowledgeArtifact` | `KnowledgeSnapshot` |
| `PromptArtifact` | `CompiledPrompt` |
| `ExecutionArtifact` | `ExecutionResult` |
| `EvaluationArtifact` | `EvaluationReport` |
| `MemoryArtifact` | `MemorySnapshot` |
| `LearningArtifact` | Learning signal (placeholder) |
| Others | Structured placeholder payloads |

## Summary

Artifacts are the **Git Objects for Intelligence** — immutable, versioned, lineage-aware, provenance-rich objects that unify how UNAGENCY represents, exchanges, and audits intelligence without prescribing storage or provider implementation.
