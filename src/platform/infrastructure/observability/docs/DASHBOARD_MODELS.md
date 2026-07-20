# Dashboard Models

`DashboardKind` → `DashboardModel` (title, generatedAt, panels).

| Kind | Focus |
|------|--------|
| `executive` | Spend, health, critical alerts |
| `operations` | Latency, failures, queue/worker load |
| `provider` | Provider duration, errors, health |
| `cost` | By org / provider / model / budget |
| `capability` | Capability latency and volume |
| `organization` | Org spend, tokens, health |
| `engineering` | Traces, retries, DLQ, surface errors |

Panels are structured data models — not Grafana dashboards.
