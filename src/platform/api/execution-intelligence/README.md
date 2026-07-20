# Execution Intelligence API

Read-only explainability surface on the Enterprise API Gateway.

Exposes model decisions, routing, planning, timeline, tokens, cost breakdown,
quality, confidence, audit, and decision graph for every execution.

- Never returns prompts
- Never returns provider secrets
- Does not redesign Model Intelligence, Routing, or execution flow
- Projections live under `src/platform/api/execution-intelligence/`

See `api/docs/MASTER_API_REFERENCE.md` and OpenAPI paths under `/executions/{executionId}/*`.
