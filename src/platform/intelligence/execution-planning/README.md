# Execution Planning Engine (M1.4)

## Purpose

Transform a **Capability Request** into an immutable **Execution Plan**.

This module is the planning brain of the Intelligence Platform. It does **not** execute AI, call provider SDKs, or orchestrate runs.

## Planning pipeline

```
CapabilityRequest
      ↓ validateRequest
PlanningContext
      ↓ resolveCapability          (ICapabilityResolver)
      ↓ applyPolicies              (IPolicyResolver)
      ↓ selectProvider             (IProviderSelectionStrategy + IModelSelectionStrategy)
      ↓ estimateCost               (ICostEstimationStrategy)
      ↓ determineExecutionMode     (retry/timeout/human/evaluation/routing strategies)
      ↓ buildExecutionGraph        (IExecutionGraphBuilder)
      ↓
ExecutionPlan (immutable graph + metadata)
```

## ExecutionPlan model

```
ExecutionPlan
├── providerSelection / retry / timeout / budget / evaluation / humanReview
├── executionStrategy / executionMode / priority
├── metadata
└── graph: ExecutionGraph
      ├── nodes: ExecutionNode[]
      ├── edges: ExecutionEdge[]
      └── stages: ExecutionStage[]
```

Initial graphs are **linear** (sequential), optionally with a human-review node.

## Strategy interfaces

| Strategy | Role |
|----------|------|
| `ICapabilityResolver` | Resolve capability definition |
| `IPolicyResolver` | Apply policy decisions |
| `IProviderSelectionStrategy` | Choose primary/fallback providers |
| `IModelSelectionStrategy` | Optional model id |
| `ICostEstimationStrategy` | Cost/token estimate |
| `IRetryStrategy` / `ITimeoutStrategy` | Retry & timeout plans |
| `IHumanReviewStrategy` / `IEvaluationStrategy` | Review & evaluation |
| `IRoutingStrategy` | Mode, strategy, budget, routing constraints |
| `IExecutionGraphBuilder` | Build nodes/edges/stages |

Placeholder implementations live under `strategies/placeholders/`.

## Usage

```typescript
import { createExecutionPlanningEngine } from "./platform/intelligence/execution-planning";

const engine = createExecutionPlanningEngine({
  capabilityRegistry,
  providerRegistry,
  providerCapabilityMatrix,
  policyEngine, // optional
});

const plan = await engine.produceExecutionPlan({
  capabilityId,
  organizationId,
  workspaceId,
});
```

## Dependencies (interfaces only)

- Capability Registry
- Provider Registry
- Provider Capability Matrix
- Policies (optional)

## Boundaries / MUST NOT

- Call provider SDKs or HTTP
- Execute AI
- Orchestrate runs
- Modify Kernel / Capability / Provider milestone code
- Depend on concrete implementations (ports only)
