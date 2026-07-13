# Intelligence Gateway (M1.7)

## Purpose

Sole public entry point into the Intelligence Platform.

Business modules may depend **only** on `IIntelligenceGateway`.

## Public API

| Method | Role |
|--------|------|
| `invokeCapability` | Plan → Orchestrate → Runtime → Result |
| `getExecution` | Retrieve snapshot |
| `cancelExecution` / `pauseExecution` / `resumeExecution` | Control |
| `getExecutionStatus` | Status + metrics |
| `health` | Aggregated platform health |
| `validateCapability` | Capability exists & enabled |

## End-to-end flow

```
Business Module
      ↓
IIntelligenceGateway.invokeCapability()
      ↓
Execution Planning Engine
      ↓
Execution Plan
      ↓
Intelligence Orchestrator
      ↓
Execution Runtime
      ↓
Mock capability output (deterministic)
      ↓
GatewayCapabilityResponse
```

## Composition root

`PlatformCompositionRoot` (gateway/factories) wires:

Kernel (via frozen `CompositionRoot`) → Capability Registry/Catalog → Provider Registry/Matrix → Planning → Runtime → Orchestrator → Gateway

Concrete implementations are created only in this composition root.

## Mock capabilities

| Id | Behavior |
|----|----------|
| `echo` | Returns input message |
| `uppercase` | Uppercases `text` |
| `summarize_mock` | Returns `{ summary: "Mock summary." }` |
| `translate_mock` | Returns mock translation |

No provider SDKs.

## Usage

```typescript
import {
  bootstrapIntelligenceGateway,
  shutdownIntelligenceGateway,
} from "./platform/intelligence/gateway";

const platform = await bootstrapIntelligenceGateway();
const result = await platform.gateway.invokeCapability({
  capabilityId: "echo",
  organizationId: "org_1",
  workspaceId: "ws_1",
  input: { message: "Hello" },
});

await shutdownIntelligenceGateway();
```

## Boundaries / MUST NOT

- Expose planner/orchestrator/runtime to business modules
- Import provider SDKs
- Open HTTP routes
- Modify frozen milestones
