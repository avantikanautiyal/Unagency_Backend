# Planning Layer Architecture

## Part 1 — Pre-change review

| Concept | Already existed? | Notes |
|---------|------------------|-------|
| **Capability Catalog** | No | Kernel had thin `CapabilityDescriptor` (id/name/status/version) for **registration presence** only — not planning metadata. |
| **Provider Capability Matrix** | No | Kernel had thin `ProviderDescriptor` for **registration presence** only — not feature support. |
| **Execution Planner** | Yes (as `planner`) | Renamed to `execution-planner` for precision; contracts expanded. |

No responsibilities were duplicated: registry ≠ catalog ≠ matrix ≠ planner.

## Separation rationale

Like Kubernetes (desired state vs node capacity vs scheduler) or Temporal (workflow definition vs task queue vs worker):

1. **Catalog** = desired capability definition (configuration)
2. **Matrix** = provider capacity/features
3. **Planner** = scheduling decision (Execution Plan)
4. **Registry** = what is installed/registered in the kernel

## End-to-end flow

```
Business Module
      ↓
IIntelligenceGateway
      ↓
Execution Planner
      ↓
Capability Catalog
      ↓
Provider Capability Matrix
      ↓
Orchestrator
      ↓
Execution Engine
      ↓
Provider
```

### Planning-only diagram

```
Capability Request
        ↓
Execution Planner
        ↓
Capability Catalog
        ↓
Provider Capability Matrix
        ↓
Execution Plan
```

## Ownership rules

| Decision | Owner |
|----------|-------|
| Provider selection | **Execution Planner only** |
| Capability metadata | Capability Catalog |
| Provider features | Provider Capability Matrix |
| Component registration | Kernel Registry |
| Execution | Orchestrator / Execution Engine (future) |

Business modules and providers must never select providers.
