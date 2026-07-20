# Frontend Integration Guide

Goal: React Native and Web integrate **without inspecting backend source**. Use this folder as the contract.

## Surfaces

```
Mobile / Web
   ├── Legacy Express  →  /auth, /organizations, /projects, /tasks, /subscription, …
   └── Enterprise Gateway  →  /v1/* or /v2/*  (executions, catalogs, tenancy)
```

## Recommended client wiring

1. **Auth (product today)** — Legacy `/auth/register-login` or Firebase verify → store legacy token.
2. **Auth (platform Gateway)** — `POST /v1/auth/login` → store `accessToken`.
3. **AI execution** — always Gateway:

```http
POST /v1/executions
Authorization: Bearer <gatewayAccessToken>
Content-Type: application/json

{
  "prompt": "…",
  "organizationId": "org_…",
  "workspaceId": "ws_…",
  "capabilityId": "marketing.copy",
  "metadata": {
    "brandBrain": {},
    "knowledgeIntelligence": {}
  },
  "stream": true
}
```

4. **Poll status** — `GET /v1/executions/{executionId}`
5. **Stream** — `GET /v1/executions/{executionId}/stream` (SSE frames inside JSON `data`; parse frames client-side)
6. **Artifacts / cost / eval / experience** — sibling GET routes under the same execution id
7. **Execution intelligence (explainability)** — inspect decisions without prompts/secrets:

```http
GET /v1/executions/{executionId}/model-decision
GET /v1/executions/{executionId}/routing
GET /v1/executions/{executionId}/planning
GET /v1/executions/{executionId}/timeline
GET /v1/executions/{executionId}/provider
GET /v1/executions/{executionId}/metrics
GET /v1/executions/{executionId}/tokens
GET /v1/executions/{executionId}/cost-breakdown
GET /v1/executions/{executionId}/quality
GET /v1/executions/{executionId}/confidence
GET /v1/executions/{executionId}/audit
GET /v1/executions/{executionId}/decision-graph
```

8. **Catalogs** — `GET /v1/capabilities|providers|models`

## Headers

| Header | Gateway | Legacy |
|--------|---------|--------|
| `Authorization: Bearer …` | Required (except health/login) | Required on most mounts |
| `x-api-key` | Alternative to Bearer | Not used |
| `Content-Type: application/json` | Yes | Yes |
| Correlation | Optional `x-correlation-id` if client sets headers map | App-specific |

## Success / error shapes (Gateway)

Success:

```json
{ "data": { }, "meta": { } }
```

Error:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "…", "details": {} } }
```

HTTP status codes: 200/201 success; 400 validation; 401 auth; 403 RBAC/tenant; 404 missing; 429 rate limit; 500 server.

Legacy Express uses existing controller response shapes (status + body conventions in `src/controllers/*`) — treat Postman Legacy folder as the path catalog; inspect response payloads against current app behavior.

## What frontends must NOT call

- Intelligence OS modules directly
- Provider SDKs
- Brand Brain / Knowledge Intelligence engines directly
- Persistence / Studio engines directly

Enrichment should arrive as **structured metadata** on `POST /v1/executions` once product orchestration attaches Brand Brain / KI packages (orchestration is Business/Studio’s job — not ad-hoc frontend OS calls).

## Imports for tooling

| Artifact | Use |
|----------|-----|
| `OPENAPI.yaml` | Codegen / Swagger UI |
| `POSTMAN_COLLECTION.json` | Manual QA |
| `INSOMNIA_COLLECTION.json` | Manual QA |
| `MASTER_API_REFERENCE.md` | Human catalog |
| `MISSING_API_REPORT.md` | Gaps vs desired domain coverage |

## Environment variables (suggested)

```
UNAGENCY_API_BASE=https://api.example.com
UNAGENCY_API_VERSION=v1
UNAGENCY_LEGACY_BASE=https://api.example.com
```
