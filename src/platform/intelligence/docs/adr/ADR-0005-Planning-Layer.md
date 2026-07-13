# ADR-0005: Planning Layer (Catalog, Matrix, Execution Planner)

## Status

Accepted

## Context

Provider-independent execution requires a planning layer that separates:

1. What capabilities exist and how they are constrained (metadata)
2. What providers can do (features)
3. Which provider and strategies to use for a request (plan)

Without this separation, provider selection leaks into business modules or provider adapters.

## Decision

Introduce three architecture modules:

1. **`capability-catalog`** — configuration-driven `CapabilityDefinition` metadata; no execution
2. **`provider-capability-matrix`** — `ProviderCapabilityProfile` feature support; not the Provider Registry
3. **`execution-planner`** (renamed from `planner`) — sole owner of provider selection; outputs `ExecutionPlan` only

Kernel registries remain for **registration presence** only.

Flow:

```
Capability Request → Execution Planner → Catalog → Matrix → Execution Plan → Orchestrator
```

## Consequences

- Positive: Clear ownership; provider-agnostic business API; testable planning without SDKs
- Negative: More modules to implement in M1 planning spine
- Neutral: Catalog and matrix are configuration-driven; loaders deferred

## Alternatives Considered

- Put metadata on CapabilityDescriptor in kernel registry: rejected (mixes registration with planning)
- Let orchestrator select providers: rejected (selection must be explicit and auditable as a plan)
- Let business modules pass provider ids: rejected (violates platform boundary)
