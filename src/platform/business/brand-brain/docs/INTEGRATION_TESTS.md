# Brand Brain — Integration Tests

## Scope (this milestone)

Integration is exercised inside the Brand Brain suite and Business Platform
composition points:

1. **Two-org same ask** — proves proprietary differentiation end-to-end through
   `enrich()` → `toExecutionMetadata()`.
2. **Gateway metadata pass-through** — `GatewayExecutionClient.createExecution`
   accepts optional `metadata` for Brand Brain packages (additive; no Gateway
   redesign).
3. **Business export** — `src/platform/business` re-exports Brand Brain for
   product assembly.

## Deferred (not this milestone)

- Live Gateway → OS round-trip with production tenants
- Durable persistence adapter soak tests
- Frontend-driven CRUD of Brand Brain UI

## Success criterion (verified in suite)

Two organizations asking the same business question receive **different**
structured enrichment because their Brand Brains differ. Intelligence OS remains
unchanged.
