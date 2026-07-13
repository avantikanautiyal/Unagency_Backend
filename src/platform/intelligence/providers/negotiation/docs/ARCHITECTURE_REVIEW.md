# M4.3 — Architecture Review

## 1. Purpose & boundaries

The Provider Negotiation Platform answers a single question:

> **Given an `ExecutionPlan`, MAY a provider execute it — and under exactly what
> negotiated terms?**

It is a pure decision engine. It consults platform services (capability
registry, provider registry, capability matrix, provider health, provider
identity, policies) and produces an immutable `NegotiatedExecution`. It never
executes, authenticates, routes, persists, or touches the network.

### Position in the platform

```
Business Platform
      ↓
Intelligence Gateway
      ↓
Intelligence Orchestrator
      ↓
Execution Planning ──► ExecutionPlan
      ↓
┌─────────────────────────────────────────┐
│  M4.3 Provider Negotiation Platform      │  ◄── this module
│  (decides whether/how to execute)        │
└─────────────────────────────────────────┘
      ↓ NegotiatedExecution
M4.1 Provider Runtime (executes)
      ↑ credential session
M4.2 Provider Identity & Trust (consulted)
```

## 2. Negotiation Architecture Diagram

```mermaid
flowchart TD
    REQ[NegotiationRequest\n(ExecutionPlan + scope + prefs)] --> ENG[ProviderNegotiationEngine]

    subgraph Pipeline[Negotiation Pipeline]
      direction TB
      C[CapabilityNegotiator] --> P[ProviderNegotiator]
      P --> M[ModelNegotiator]
      M --> K[ConstraintNegotiator]
      K --> I[IdentityNegotiator]
      I --> PO[PolicyNegotiator]
      PO --> F[FeatureNegotiator]
      F --> B[BudgetNegotiator]
      B --> R[RegionalNegotiator]
      R --> Q[QualityNegotiator]
    end

    ENG --> Pipeline
    Pipeline --> DEC[decide + computeConfidence]
    DEC --> OUT[NegotiationResult]
    OUT -->|accepted| NE[NegotiatedExecution]

    C -. reads .-> CR[(ICapabilityRegistry)]
    P -. reads .-> PR[(IProviderRegistry)]
    P -. reads .-> HS[(IProviderHealthStore)]
    M -. reads .-> MX[(IProviderCapabilityMatrix)]
    I -. consults .-> ID[(IProviderIdentityEngine · M4.2)]
    PO -. consults .-> PP[(IPolicyProvider)]
```

Every arrow into a data store is an **interface** dependency — no concrete
frozen implementation is imported by the negotiators.

## 3. Design principles

| Principle | How it is honored |
| --- | --- |
| Single Responsibility | One negotiator per concern (capability, provider, model, feature, constraint, policy, regional, quality, budget, identity). |
| Open/Closed | New negotiators or strategies are added via DI in the factory; the engine is unchanged. |
| Liskov | Every negotiator honors a narrow port returning `Result<T>`. |
| Interface Segregation | Ports are tiny (usually a single `negotiate` method). |
| Dependency Inversion | The engine depends on `I*Negotiator` ports; the factory injects concretes. |
| Immutability | All contracts are `readonly`; builders `Object.freeze` outputs. |
| Result pattern | Business rejection = `success(result{decision:"rejected"})`; only malformed inputs = `failure`. |

## 4. Pipeline stages

| # | Stage | Port | Hard failure examples | Soft warning examples |
| --- | --- | --- | --- | --- |
| 1 | Capability | `ICapabilityNegotiator` | not found, disabled, provider-incompatible | experimental/beta maturity |
| 2 | Provider | `IProviderNegotiator` | unregistered, unavailable, restricted, incompatible | deprecated, unhealthy (unless required) |
| 3 | Model | `IModelNegotiator` | no capability profile | — |
| 4 | Constraint | `IConstraintNegotiator` | — | timeout capped |
| 5 | Identity | `IIdentityNegotiator` | unvalidated (if required) | unvalidated (if configured, not required) |
| 6 | Policy | `IPolicyNegotiator` | consulted policy denied | — |
| 7 | Feature | `IFeatureNegotiator` | requested feature unsupported | unknown feature string |
| 8 | Budget | `IBudgetNegotiator` | planned cost exceeds ceiling | — |
| 9 | Regional | `IRegionalNegotiator` | region not served / denied | — |
| 10 | Quality | `IQualityNegotiator` | risk exceeds tolerance | — |
| — | Decision | engine | — | — |

## 5. Dependency Graph

```mermaid
flowchart LR
    NEG[providers/negotiation]

    NEG --> SH[shared]
    NEG --> EV[events]
    NEG --> CR[capability-registry (contracts+interfaces)]
    NEG --> EP[execution-planning (contracts)]
    NEG --> PM[providers/capability-matrix]
    NEG --> PMD[providers/metadata]
    NEG --> PRG[providers/registry]
    NEG --> PH[providers/health]
    NEG --> RT[providers/runtime (contracts)]
    NEG --> ID[providers/identity (interfaces+contracts)]

    NEG -.->|NEVER| X1[Provider SDKs]
    NEG -.->|NEVER| X2[HTTP / Mongo / Redis / BullMQ]
    NEG -.->|NEVER| X3[Business modules]
```

- **Inward only**: negotiation depends on control-plane + provider platform
  contracts; nothing depends back on negotiation except the future orchestrator.
- **No cycles**: negotiation is a leaf consumer of the frozen modules.
- **No forbidden imports**: verified by inspection — no vendor SDK, transport,
  datastore, or business-module import anywhere in the tree.

## 6. Runtime consumability

`builders/negotiated-execution-projector.ts` maps a `NegotiatedExecution`
directly into the M4.1 `ProviderExecutionRequest` (provider id, model id,
retry/timeout policies, streaming, priority, metadata). This proves the success
criterion: **every execution decision is made before the runtime is entered.**
