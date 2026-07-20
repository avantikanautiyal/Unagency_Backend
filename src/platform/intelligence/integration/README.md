# Intelligence OS Integration Layer

Connects all frozen Intelligence OS modules into **one deterministic pipeline**
through **bridges only**.

Modules never call each other. Ownership is unchanged.

## Pipeline

```
Raw Request
  → Task Intelligence
  → Capability Intelligence
  → Agent Planning
  → Workflow Intelligence
  → Execution Governance
  → Experience Injection
  → Execution Intelligence
  → Model Intelligence
  → Negotiation
  → Routing
  → Provider Runtime
  → Consensus
  → Evaluation
  → Evaluation Intelligence
  → Learning
  → Execution Optimization
  → Experience Intelligence
  → Repository Updates
```

## Usage

```typescript
import { createIntelligenceOsIntegrationPlatform } from "./index";
import { sampleIntegrationRequest } from "./testing";

const { engine } = createIntelligenceOsIntegrationPlatform();
const report = await engine.run(sampleIntegrationRequest());

if (report.ok && report.value.success) {
  console.log(report.value.stagesCompleted);
  console.log(report.value.trace.bridges.length);
}
```

Runtime defaults to `ControllableDispatcher` (no networking). Only OpenAI leaf
integration is permitted when overriding the dispatcher.

See `docs/` for architecture, bridge map, and ACP.
