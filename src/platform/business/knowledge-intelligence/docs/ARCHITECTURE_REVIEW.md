# Knowledge Intelligence — Architecture Review

## Verdict

Additive semantic layer over Brand Brain under the Business Platform. Does **not**
redesign Brand Brain, Intelligence OS, Gateway, Persistence, or Deployment.

## Placement

```
Business Platform
  ├── Brand Brain          ← facts (SoT)
  └── Knowledge Intelligence ← relationships + traversal + context assembly
            ↓ metadata
Enterprise API Gateway → Intelligence OS (frozen)
```

## Design principles

1. Brand Brain is the source of truth; KI projects and extends graph understanding.
2. Structured context only — no prompts, no raw documents, no LLM reasoning.
3. Typed, extensible ontology for entities and relationships.
4. Deterministic graph algorithms for traversal and ranking.
5. Every fact explainable; every relationship versioned via snapshots.

## Non-goals

- OS / Brand Brain redesign
- Embedding stores or vector RAG (future)
- Frontend / admin UI
- Prompt generation
