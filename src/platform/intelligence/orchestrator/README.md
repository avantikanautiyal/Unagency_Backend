# Intelligence Orchestrator (M1.6)

## Purpose

Coordinate the lifecycle of an **already approved** `ExecutionPlan`.

Does **not** create plans, choose providers, or call provider SDKs.

## Orchestration pipeline

```
ExecutionPlan
    ↓
ExecutionValidator
    ↓
RuntimeInitializer
    ↓
ExecutionDispatcher
    ↓
ExecutionRuntime (interface)
    ↓
ResultAggregator
    ↓
OrchestrationResult
```

Middleware wraps the pipeline (logging, metrics, security, tracing, auditing — placeholders).

## Hook lifecycle

```
beforePlanExecution
  → beforeDispatch
    → beforeRuntime
      → [runtime]
    → afterRuntime
  → afterAggregation
→ onComplete

onFailure / onRetry (failure paths; retry not executed in M1.6)
```

## Middleware architecture

Onion model via `MiddlewarePipeline`:

```
logging → metrics → security → tracing → auditing → terminal pipeline
```

## Failure coordination

`FailureCoordinator` returns placeholder decisions:

- retry / fallback / cancel / timeout / rollback hooks

No retry execution yet.

## Result aggregation

`ResultAggregator` combines one or more `ExecutionResult` values into an immutable `OrchestrationResult` (`completed` | `failed` | `cancelled` | `partial`).

## Usage

```typescript
import { createIntelligenceOrchestrator } from "./platform/intelligence/orchestrator";

const orchestrator = createIntelligenceOrchestrator({ runtime });
const result = await orchestrator.orchestrate({ plan, runtimeContext });
```

## Boundaries / MUST NOT

- Create execution plans
- Select providers
- Import provider SDKs
- Execute AI
- Modify frozen milestones
