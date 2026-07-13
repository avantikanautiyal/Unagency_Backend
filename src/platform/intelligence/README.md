# UNAGENCY Intelligence Platform

**Canonical location:** `src/platform/intelligence/` (single source of truth)

Enterprise Intelligence Operating System foundation. No AI execution in this phase.

## Folder Tree

```
src/platform/intelligence/
├── kernel/                         # OS kernel: lifecycle, DI, registries, health
│   ├── registry/                   # Registration presence (not planning metadata)
│   ├── health/
│   ├── composition/
│   ├── bootstrap/
│   └── lifecycle/
├── shared/
├── config/
├── events/
├── security/
├── telemetry/
├── runtime/                        # Execution session/pipeline contracts
├── policies/                       # Cross-platform policy engine
├── scheduler/
├── capability-registry/            # Capability source of truth (M1.2)
├── capability-catalog/             # Capability discovery (M1.2)
├── providers/                      # Provider Platform (M1.3)
├── provider-capability-matrix/     # Compat shim → providers/capability-matrix
├── execution-planning/             # Execution Planning Engine (M1.4)
├── execution-planner/              # Compat shim → execution-planning
├── execution-runtime/              # Execution Runtime (M1.5)
├── orchestrator/                   # Intelligence Orchestrator (M1.6)
├── gateway/                        # Intelligence Gateway (M1.7) — public entry
├── context/                        # Context Intelligence Engine (M2.1)
├── knowledge/                      # Knowledge Intelligence Engine (M2.2)
├── prompt-compiler/                # Prompt Compiler (M2.3)
├── memory/                         # Memory Intelligence Engine (M2.4)
├── evaluation/                     # Intelligence Evaluation Platform (M3.1)
├── artifacts/                      # Intelligence Artifact Platform (M3.2)
├── learning/                       # Learning Intelligence Platform (M3.3)
├── playground/
├── cli/
├── docs/
└── testing/
```

## Planning Layer (why it exists)

Provider selection must never happen in business modules or inside providers.

```
Business Module
      ↓
IIntelligenceGateway          (M1)
      ↓
Execution Planner             ← sole owner of provider selection
      ↓
Capability Catalog            ← capability metadata
      ↓
Provider Capability Matrix    ← provider features / modalities
      ↓
Policies                      ← cost, quota, retry constraints
      ↓
Execution Plan
      ↓
Orchestrator                  (M1+)
      ↓
Execution Engine              (M1+)
      ↓
Provider                      (leaf adapter)
```

### Capability Request → Execution Plan

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

| Module | Answers |
|--------|---------|
| **Capability Catalog** | What is this capability, and what are its defaults/constraints? |
| **Provider Capability Matrix** | Which providers support the required features? |
| **Execution Planner** | Which provider and strategies should this run use? |
| **Kernel Registry** | Is the component registered in the platform? |

## Module Roles

| Module | Role |
|--------|------|
| **kernel** | Lifecycle, DI, composition, registries, health |
| **capability-registry** | Source of truth for capability definitions |
| **capability-catalog** | Discovery/search over the registry (read-only) |
| **providers** | Provider metadata, registry, factory, matrix, health |
| **execution-planning** | CapabilityRequest → ExecutionPlan (no execution) |
| **execution-runtime** | Sessions, state machine, monitor, events (no providers) |
| **orchestrator** | Coordinates approved plans via runtime (no provider SDKs) |
| **gateway** | Sole public façade for business modules |
| **context** | Provider-independent IntelligenceContext construction |
| **knowledge** | Knowledge discovery, ranking, filtering, snapshots |
| **prompt-compiler** | Context + knowledge → provider-independent CompiledPrompt |
| **memory** | Experience-layer memory records and snapshots |
| **evaluation** | Objective execution output evaluation and review signals |
| **artifacts** | Canonical immutable intelligence objects (Git for Intelligence) |
| **learning** | Artifact-driven recommendations without behavior modification |
| **policies** | Cross-cutting policy ports |
| **runtime** | In-flight execution session/pipeline contracts |
| **security** | Trust, authz, audit, classification |
| **events / telemetry / config / shared** | Foundation services |

## Dependency Graph

```
shared
  ↑
  ├── config, events, security, telemetry
  ├── policies
  ├── runtime
  ├── scheduler
  ├── capability-catalog              (shared only)
  ├── provider-capability-matrix      (shared only)
  ├── execution-planner ──► catalog, matrix, policies (interfaces only)
  ├── kernel (owns registry + health)
  ├── cli / playground
  └── testing
```

Business modules may depend only on `IIntelligenceGateway` (M1).

## Documentation

- [ADRs](./docs/adr/)
- [Engineering standards](./docs/engineering/)
- [Dependency validation](./docs/DEPENDENCY_VALIDATION.md)
- [Architecture review](./docs/ARCHITECTURE_REVIEW.md)
- [Implementation order](./docs/IMPLEMENTATION_ORDER.md)
- [Planning layer](./docs/PLANNING_LAYER.md)
