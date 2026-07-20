# Retrieval Model

## Query (`KnowledgeRetrievalQuery`)

| Field | Effect |
|-------|--------|
| `seedEntityIds` / `seedTypes` | Explicit graph entry points |
| `productId` / `campaignId` / `audienceId` | Resolve projected entity ids |
| `region` / `market` / `department` / `capabilityId` | Soft tag boosts |
| `maxDepth` | Traversal depth (default 2) |
| `maxFacts` | Ranked fact cap (default 40) |
| `preferRelationshipTypes` | Optional edge-type filter |

## Flow

1. Resolve seeds.
2. Expand neighborhood + relationship evidence + shortest paths.
3. Rank and truncate facts.
4. Attach explainability parallel to facts.

Missing graph → hard failure (no invented context).
