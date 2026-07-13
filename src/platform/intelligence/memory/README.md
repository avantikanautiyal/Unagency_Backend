# Memory Intelligence Engine (M2.4)

## Purpose

Store, classify, retrieve, and snapshot intelligence artifacts produced during execution.

Memory is the platform **experience layer** — not conversation history, learning, or vector storage.

## Pipeline

```
Execution artifacts
  → Memory Builder
  → Classification
  → Retention
  → Compression
  → Store
  → Snapshot
  → MemoryResult
```

## Scopes

Platform, Organization, Workspace, Project, Campaign, Task, Conversation, Session

## Classifications

Prompt, Knowledge, Execution, Response, Evaluation, HumanFeedback, BrandAsset, Decision, LearningReference, Conversation

## Usage

```typescript
import {
  createMemoryIntelligenceEngine,
  artifactsFromExecution,
} from "./platform/intelligence/memory";

const engine = createMemoryIntelligenceEngine();
const result = await engine.ingest({
  identity,
  scope: { kind: "session", scopeId: "session_1" },
  artifacts: artifactsFromExecution({ prompt, knowledge, response }),
});
```

## Boundaries / MUST NOT

- Call providers or import SDKs
- Implement learning or evaluation engines
- Connect to MongoDB/Redis/vector DBs
- Treat memory as chat history
- Modify frozen milestones
