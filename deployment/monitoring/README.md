# Monitoring — wire existing Observability platform into deployment.

## Pattern

- Set `OBSERVABILITY_ENABLED=true` on API / workers.
- Business & Intelligence emit telemetry through existing public Observability APIs.
- Scrape/export is out of band: forward `engine.exportData(...)` or logs to your collector.

## Kubernetes

Optional sidecar later — do **not** redesign Observability module.

## Health

- Container HEALTHCHECK → `/health` or `/v1/health`
- K8s liveness/readiness probes on API deployment
