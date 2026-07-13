# Dependency Validation Report

**Canonical root:** `src/platform/intelligence/`

## Planning-layer rules

| Rule | Status |
|------|--------|
| Capability Catalog never depends on providers | ✓ Pass (`shared` only) |
| Capability Catalog never depends on planner | ✓ Pass |
| Capability Catalog only exposes metadata | ✓ Pass |
| Provider Capability Matrix never imports providers | ✓ Pass (`ProviderId` brand only) |
| Execution Planner depends only on interfaces | ✓ Pass (architecture; future injection of catalog/matrix/policies ports) |
| Planner produces `ExecutionPlan` only | ✓ Pass (`Result<ExecutionPlan>`) |
| No circular dependencies | ✓ Pass |
| Provider selection only in Execution Planner | ✓ Pass (documented ownership) |

## Allowed graph

```
shared
  ↑
  ├── config
  ├── events
  ├── security
  ├── telemetry
  ├── policies
  ├── runtime
  ├── scheduler
  ├── capability-catalog
  ├── provider-capability-matrix
  ├── execution-planner ──► capability-catalog, provider-capability-matrix, policies (interfaces)
  ├── kernel
  │     ├── registry
  │     └── health
  ├── cli / playground
  └── testing
```

## Forbidden edges

| From | To | Reason |
|------|----|--------|
| capability-catalog | execution-planner | Catalog is metadata source, not consumer |
| capability-catalog | providers / SDKs | Provider-independent |
| provider-capability-matrix | providers / SDKs | Matrix is data, not adapters |
| execution-planner | provider implementations | Selection uses IDs + matrix only |
| business modules | catalog / matrix / planner | Gateway only (M1) |
| providers | planner | Providers are leaves |

## Cleanup applied

- Removed orphaned top-level `registry/` (duplicate of `kernel/registry`)
- Renamed `planner/` → `execution-planner/`
