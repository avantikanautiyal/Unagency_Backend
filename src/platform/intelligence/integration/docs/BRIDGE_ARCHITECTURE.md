# Bridge Architecture

```
Producer Module  --(public output)-->  Bridge  --(public request)-->  Consumer Module
                         │
                         └── publishes BridgeObservabilityRecord
                             (timing, inputs, outputs, artifacts, failures, correlationId)
```

## Rules

1. Bridges never embed business algorithms owned by modules.
2. Bridges may map fields via `adapters/request-adapters.ts`.
3. Observability is mandatory on every hop (`observeBridgeCall`).
4. Modules remain independently constructible and testable.

## Required bridges (mission list)

All mission-named bridges are implemented under `bridges/stage-bridges.ts`.
Adjacent hops (Capability→Agent, Agent→Workflow, Raw→Task) are included so the
full pipeline never needs a direct module call.
