# Context Intelligence Engine (M2.1)

## Purpose

Construct the complete **IntelligenceContext** consumed later by the Prompt Compiler.

Provider-independent. No prompts, RAG, memory, or provider SDKs.

## Context architecture

```
Capability Request / ContextBuildRequest
        ↓
Section Builders (independent)
        ↓
Enrichment Pipeline (replaceable stages)
        ↓
ContextNormalizer
        ↓
ContextValidator
        ↓
IntelligenceContext / ContextSnapshot
```

## Enrichment pipeline

```
Base → Organization → Workspace → Brand → Capability
  → Execution → Security → Assets → Final
```

## Builder hierarchy

`IntelligenceContextBuilder` coordinates:

Organization, Workspace, Project, Requirement, Task, User, Role, Capability, Execution, Brand, Asset, Security, Language/Locale/TimeZone, Platform

## Resolver hierarchy

Placeholder resolvers (availability only):

Organization, Workspace, User, Brand, Asset, Capability

## Object model

`IntelligenceContext` aggregates independently resolvable sections plus `ContextIdentity`, `ContextScope`, `ContextMetadata`, and policy references.

## Validation flow

Completeness → scope consistency → identity → capability alignment → language/locale/platform

Returns `Result<ContextValidationResult>`.

## Usage

```typescript
import { createContextIntelligenceEngine } from "./platform/intelligence/context";

const engine = createContextIntelligenceEngine({ capabilityRegistry });
const context = await engine.build({
  capabilityId: "echo",
  organizationId: "org_1",
  workspaceId: "ws_1",
  inputHints: { message: "Hello" },
});
```

## Boundaries / MUST NOT

- Generate prompts
- Call providers / know provider names
- Retrieve vectors or store memory
- Access databases or HTTP
- Execute AI
