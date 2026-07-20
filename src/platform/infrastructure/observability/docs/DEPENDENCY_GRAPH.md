# Dependency Graph

```
ObservabilityPlatform
 └─ ObservabilityEngine
     ├─ ITelemetryStore (InMemoryTelemetryStore)
     ├─ cost / token aggregators
     ├─ health aggregator
     ├─ alert evaluator
     ├─ dashboard builder
     ├─ diagnostic builder
     ├─ report generator
     ├─ retention / export
     └─ (optional ingest via) analytics collectors
           ├─ collectFromIntegrationReport → Integration public report
           └─ collectFromExecutionMetrics → Execution metrics snapshot
```

Upstream platforms are **read-only callees** for collectors.
Observability does **not** depend on Runtime/Routing/Negotiation internals.
No OpenTelemetry / Prometheus / Grafana / Jaeger packages.
