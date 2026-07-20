# Implementation Report

| Component | Path |
|-----------|------|
| Engine | `engine/observability-engine.ts` |
| Telemetry store | `tracing/in-memory-telemetry-store.ts` |
| Cost intelligence | `costs/cost-intelligence.ts` |
| Token intelligence | `tokens/token-intelligence.ts` |
| Health | `health/health-aggregator.ts` |
| Alerts | `alerts/alert-evaluator.ts` |
| Dashboards | `dashboards/dashboard-builder.ts` |
| Diagnostics | `diagnostics/diagnostic-builder.ts` |
| Reporting | `reporting/report-generator.ts` |
| Retention | `retention/retention.ts` |
| Exports | `exports/export-telemetry.ts` |
| Collectors | `analytics/collectors.ts` |
| Log sanitize | `logs/sanitize.ts` |
| Builder | `builders/observability-event-builder.ts` |
| Factory | `factories/create-observability-platform.ts` |

Default store: in-memory. Optional `budgetLimit` on factory for budget alerts.
Collectors map Integration reports and Distributed Execution metrics **additively**.
