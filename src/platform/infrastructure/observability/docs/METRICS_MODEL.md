# Metrics Model

## Point

`MetricPoint`: `name`, `value`, `unit`, `surface`, `at`, optional `labels` and
partial context.

## Typical series

| Name | Source |
|------|--------|
| `stage.duration_ms` | Integration stages |
| `execution.latency_ms` | Direct ingest / runtime |
| `queue.*` / `worker.*` | Distributed Execution metrics collector |
| `retry.count` / failure counters | Alerts & ops dashboards |

## Query

`IObservabilityEngine.queryMetrics({ name, surface, since })` filters the
in-memory store. No Prometheus scrape model in this milestone.
