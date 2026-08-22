# Phase 3 — Knowledge Intelligence

## Objective

Retrieve **task-aware, tenant-safe factual knowledge** as structured `KnowledgeContext` and ensure it reaches the actual provider request — clearly separated from BrandContext.

## Flow

```text
POST /v1/executions
  → BriefIntelligence → StructuredBrief
  → BrandIntelligence → BrandContext
  → KnowledgeIntelligence → KnowledgeContext
  → composeKnowledgeAwarePrompt (untrusted DATA wrappers)
  → IntegrationPipeline → provider payload.prompt
```

## Guarantees

- Trusted `organizationId` from principal at retrieval boundary
- Empty vs FAILED distinguished
- Conflicts exposed (no silent resolution)
- Retrieved content wrapped as `<<<UNTRUSTED_KNOWLEDGE_DATA>>>`
- No PlaceholderKnowledgeSource on production Integration path by default

## Opt-out

`metadata.skipKnowledgeIntelligence` or `metadata.skipBrandKnowledge`
