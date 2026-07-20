# Explainability Model

## Requirement

Every returned fact must record why it was selected, with score and confidence.

## Item (`KnowledgeExplainabilityItem`)

| Field | Meaning |
|-------|---------|
| `factId` | Links to selected fact |
| `whySelected` | Human-readable reason |
| `traversalSummary` | Path / entity summary |
| `score` / `confidence` | Ranking inputs |
| `relationshipTypesUsed` | Edges involved |

## Invariant

`explainability.length === facts.length` for a valid package.
