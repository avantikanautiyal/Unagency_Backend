# Provider Mesh & Live Provider Intelligence Platform

Operational control layer for **all providers**.

- **Routing** decides WHO should execute.
- **Consensus** decides HOW multiple results become one.
- **Provider Mesh** knows real-time operational state and publishes intelligence.

The mesh **never executes providers**.

## Pipeline

```
Provider Events
  → Health
  → Telemetry
  → Metrics
  → Provider State
  → Provider Score
  → Routing Hints
  → Mesh Snapshot
```

## Usage

```typescript
import {
  createProviderMeshPlatform,
} from "./index";
import { sampleMeshRequest } from "./testing";

const { engine } = createProviderMeshPlatform();
const report = await engine.observe(sampleMeshRequest());

if (report.ok) {
  const snap = report.value.snapshot;
  console.log(snap.providers.map((p) => [p.providerId, p.state, p.compositeScore.overall]));
  console.log(snap.routingHints.length);
  console.log(snap.failoverChains[0]?.orderedFallbacks);
}
```

## Outputs

`ProviderMeshSnapshot` with operational states, composite scores, routing hints,
failover chains, canary plans, shadow recommendations, and capacity reports.

See `docs/` for models and ACP.
