# Observability Architecture

## Mission

Every production request should leave correlated telemetry from API through
Experience — without this platform invoking providers or running intelligence.

## Layers

1. **Ingest** — `ObservabilityEvent` with required `correlationId` / `traceId`
2. **Store** — `ITelemetryStore` (spans, metrics, logs, costs, tokens, health, alerts)
3. **Intelligence** — cost / token aggregation, health rollups
4. **AIOps** — alert evaluation, dashboards, diagnostics, reports
5. **Lifecycle** — retention policies and export payloads

## Surfaces observed

`api`, `queue`, `worker`, `integration`, Capability/Model Intelligence,
Negotiation, Routing, Runtime, Provider, Consensus, Evaluation, Learning,
Experience, Execution Optimization, Provider Mesh, Secret Platform,
Distributed Execution.

## Integration style

- `collectFromIntegrationReport` — stage spans + runtime tokens/cost
- `collectFromExecutionMetrics` — queue/worker/DLQ counters as metrics

No mutation of callee platforms.
