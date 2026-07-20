# API Specification

## Envelope

Success: `{ data: T, meta?: object }`  
Error: `{ error: { code, message, details? } }`

Headers: `content-type: application/json`, `x-api-version`, `x-request-id`, `x-correlation-id`.

## Domains

Authentication · Organizations · Users · Workspaces · Projects · Brand Profiles ·
Knowledge Bases · Capabilities · Executions · Providers · Models · Benchmarks ·
Analytics · Billing · Notifications · Audit · Files · Assets · Human Reviews ·
Webhooks · Health

## Execution API

| Operation | Method & Path |
|-----------|----------------|
| Create | `POST /v1/executions` |
| Get | `GET /v1/executions/:executionId` |
| Cancel | `POST /v1/executions/:executionId/cancel` |
| Retry | `POST /v1/executions/:executionId/retry` |
| Stream | `GET /v1/executions/:executionId/stream` |
| History | `GET /v1/executions` |
| Artifacts | `GET /v1/executions/:executionId/artifacts` |
| Diagnostics | `GET /v1/executions/:executionId/diagnostics` |
| Trace | `GET /v1/executions/:executionId/trace` |
| Cost | `GET /v1/executions/:executionId/cost` |
| Evaluation | `GET /v1/executions/:executionId/evaluation` |
| Experience | `GET /v1/executions/:executionId/experience` |

Versions: `/v1` and `/v2` (parallel contracts).
