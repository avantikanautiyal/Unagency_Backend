# Knowledge Intelligence — Integration Tests

## Scope

1. **Brand Brain → KI sync** — projection consumes Brand Brain documents without
   mutating Brand Brain APIs.
2. **Two-org same capability ask** — different histories/audiences/markets yield
   different `KnowledgeContextPackage`s.
3. **Execution metadata** — `toExecutionMetadata` produces Gateway-safe envelopes
   that can merge with Brand Brain metadata.

## Deferred

- Durable polyglot graph persistence soak
- Live Gateway round-trip
- Frontend graph editors

## Success criterion (verified)

Two organizations with similar product shapes but different relationships produce
different contextual knowledge packages. Every fact is explainable. Relationship
mutations are snapshot-versioned. Intelligence OS unchanged.
