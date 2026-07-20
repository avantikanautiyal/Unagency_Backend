# Reasoning Model

## Constraint

**No LLM reasoning.** All reasoning is deterministic graph algorithms.

## Operations

| Operation | Algorithm | Output |
|-----------|-----------|--------|
| Related entities | BFS expansion to `maxDepth` | Entity set |
| Shortest path | Weighted BFS (cost = 1/weight) | `KnowledgePath` |
| Neighborhood | Depth-limited expansion | Entities + relationships used |
| Relationship scoring | Edge weight × tag/query affinity | Evidence score |
| Evidence ranking | Sort by `score * confidence` | Top-N facts |
| Context assembly | Seeds → expand → rank → package | `KnowledgeContextPackage` |

## Seed resolution

Seeds resolve from explicit ids, product/campaign/audience query fields, seed
types, or fall back to brand/organization nodes.
