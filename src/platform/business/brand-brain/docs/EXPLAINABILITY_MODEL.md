# Explainability Model

## Requirement

Every execution enrichment must record **which** Brand Brain elements were used,
**why**, with **confidence** and **relevance**.

## Item (`BrandBrainExplainabilityItem`)

| Field | Meaning |
|-------|---------|
| `factId` | links to selected fact |
| `section` | Brand Brain section |
| `whySelected` | human-readable selection reason |
| `confidence` | 0–1 source confidence |
| `relevance` | enum (e.g. high / medium / low) |
| `score` | numeric retrieval score |

## Invariants

- `explainability.length === facts.length` for a valid package.
- Why-selected is non-empty.
- Scores and confidences are positive for selected facts.

## Audit use

Downstream systems can persist `enrichmentId` + explainability alongside
Gateway execution ids without opening OS internals.
