# Context Assembly Model

## Package (`KnowledgeContextPackage`)

Structured enrichment for executions:

- `facts` — entity attributes, relationships, paths
- `relatedEntityIds` — touched neighborhood
- `explainability` — why each fact was selected
- `summary` — counts and averages
- `graphVersion` / `brandBrainVersion` — provenance

## Fact kinds

| Kind | Meaning |
|------|---------|
| `entity_attribute` | Profile of a graph node |
| `relationship` | Typed edge evidence |
| `path` | Multi-hop connection summary |
| `neighborhood` / `brand_brain_projection` | Reserved / projection provenance |

## Hard bans

- No raw knowledge documents
- No generated prompts
- No LLM-authored reasoning text as content
