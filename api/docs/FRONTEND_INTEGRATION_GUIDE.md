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
3. **AI execution** — always Gateway (thin/direct path — do **not** send enrichment novels):

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
    "directPassthrough": true,
    "brandBindingMode": "product_brand",
    "brandId": "brand_…"
  },
  "stream": true
}
```

4. **Poll status** — `GET /v1/executions/{executionId}`
5. **Stream** — `GET /v1/executions/{executionId}/stream` (SSE frames inside JSON `data`; parse frames client-side)
6. **Artifacts / cost / eval / experience** — sibling GET routes under the same execution id
7. **Explainability / execution-intelligence** — **removed**. Do not call `/model-decision`, `/routing`, `/planning`, `/decision-graph`, etc.
8. **Catalogs** — `GET /v1/capabilities|providers|models`
9. **Runtime capabilities** — `GET /v1/runtime/capabilities`

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

- Provider SDKs directly
- Internal platform modules (`src/platform/direct`, `src/platform/providers`, etc.) — use Gateway only
- Persistence engines directly

Brand/knowledge enrichment should arrive as **metadata** on `POST /v1/executions` when product orchestration attaches brand context.

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
