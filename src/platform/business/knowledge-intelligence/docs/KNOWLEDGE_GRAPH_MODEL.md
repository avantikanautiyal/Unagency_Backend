# Knowledge Graph Model

## Snapshot (`KnowledgeGraphSnapshot`)

Versioned tip of an organization's graph:

| Field | Meaning |
|-------|---------|
| `version` | Monotonic graph version |
| `brandBrainVersion` | Optional Brand Brain tip used for projection |
| `entities` | Full entity set |
| `relationships` | Full relationship set |
| `changelog` | Why this snapshot exists |

## Entity (`KnowledgeEntity`)

Typed node with attributes, tags, confidence, and source refs (usually Brand Brain
paths like `bb:product:…`).

## Relationship (`KnowledgeRelationship`)

Typed directed edge with weight, confidence, attributes, and **per-edge version**
incremented on upsert.

## Mutation model

- `syncFromBrandBrain` — replace graph from Brand Brain document (new snapshot).
- `upsertEntity` / `upsertRelationship` — incremental updates (new snapshot).
- `compare` — entity/relationship add/remove/update diff between snapshots.
