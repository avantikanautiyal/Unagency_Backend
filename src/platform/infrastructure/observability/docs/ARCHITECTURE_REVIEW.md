# Production Observability & AIOps — Architecture Review

## Verdict

Enterprise infrastructure under `src/platform/infrastructure/observability/`.
Observes the entire platform end-to-end. **Never executes AI.**

Intelligence OS, Distributed Execution, Secret Platform, and Provider Mesh remain
**unchanged** — consumed only through public interfaces via additive collectors.

## Flow

```
API / Queue / Worker / Integration / OS stages / Provider / Eval / Learning
  → ObservabilityEvent (correlation + trace context)
  → ObservabilityEngine.ingest
  → ITelemetryStore (in-memory)
  → costs | tokens | health | alerts | dashboards | diagnostics | reports
  → retention / export
```

## Boundary

| Concern | Owner |
|---------|--------|
| AI execution | Intelligence OS / Integration / Distributed Execution |
| Secrets | Secret Platform |
| Telemetry store, AIOps models | Observability (this module) |

## Non-goals

No OpenTelemetry, Prometheus, Grafana, or Jaeger SDKs in this milestone.
No database persistence. No redesign of Runtime, Routing, Negotiation, or Execution.
