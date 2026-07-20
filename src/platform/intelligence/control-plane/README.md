# Intelligence Control Plane

Orchestrates every frozen intelligence module into a single deterministic planning pipeline.

**Transforms:** `ControlPlaneRequest` (raw prompt) → `ExecutionReadyPlan`

**Does not:** execute providers, call SDKs, perform networking, or invoke AI models.

## Pipeline

```
Raw Request
  → Task Intelligence → Agent Planning → Workflow Intelligence
  → Execution Governance → Execution Intelligence → Model Intelligence
  → Provider Negotiation → Provider Routing → ExecutionReadyPlan
```

## Usage

```typescript
import {
  createIntelligenceControlPlane,
  ControlPlaneRequestBuilder,
} from "./index";

const { engine } = createIntelligenceControlPlane();

const request = ControlPlaneRequestBuilder.create()
  .withRequestId("req_1")
  .withRawPrompt("Launch our new sneaker collection")
  .withBudgetLimit(500)
  .build();

const result = await engine.plan(request);
if (result.ok) {
  console.log(result.value.executionReadyPlan);
}
```

## Testing

```typescript
import { setupIntelligenceControlPlane, sampleSneakerLaunchControlPlaneRequest } from "./testing";

const { engine } = setupIntelligenceControlPlane();
const report = await engine.plan(sampleSneakerLaunchControlPlaneRequest());
```

## Module Layout

| Directory | Responsibility |
|-----------|----------------|
| `engine/` | `IntelligenceControlPlaneEngine` — plan, simulate, explain |
| `pipeline/` | `PipelineOrchestrator` — sequential stage execution |
| `validation/` | Artifact chain and contract validation |
| `simulation/` | Dry-run reporting |
| `contracts/` | Immutable pipeline contracts |
| `factories/` | Wire all frozen intelligence engines |
| `builders/` | Request builders |
| `testing/` | Deterministic test helpers |

See `docs/` for architecture review, diagrams, and ACP certification.
