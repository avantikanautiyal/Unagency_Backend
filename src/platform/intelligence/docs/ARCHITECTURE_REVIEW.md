# Enterprise Architecture Review (Pre-M1 Planning Layer)

## Improvements Applied (this pass)

1. **Capability Catalog** — full planning metadata contracts
2. **Provider Capability Matrix** — feature/modality support contracts
3. **Execution Planner rename** — `planner` → `execution-planner` with expanded `ExecutionPlan`
4. **Orphan registry removed** — top-level `registry/` duplicate deleted
5. **Documentation** — planning flow diagrams, dependency validation, implementation order, ADR-0005

## Non-duplication

| Existing | New | Distinct because |
|----------|-----|------------------|
| `CapabilityDescriptor` (kernel registry) | `CapabilityDefinition` (catalog) | Presence vs planning metadata |
| `ProviderDescriptor` (kernel registry) | `ProviderCapabilityProfile` (matrix) | Presence vs features |
| Generic `planner` | `execution-planner` | Same module, precise name + richer plan |

## Concerns

1. Catalog preferred providers are **defaults**; final selection remains planner-owned (may override via matrix + policies).
2. Planner must not import concrete catalog/matrix implementations — only ports.
3. M1 must implement catalog/matrix loaders before any provider adapter.

## M1 readiness

See final report score. Planning layer architecture is complete; implementation not started.
