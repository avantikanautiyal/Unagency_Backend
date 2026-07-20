# UNAGENCY Master API Reference

**Inventory milestone — expose/document existing APIs only. No redesign. No invented endpoints.**

Generated from:

| Surface | Source of truth | Live on Express? |
|---------|-----------------|------------------|
| Enterprise API Gateway | `src/platform/api/routes/route-map.ts` | In-process today; nginx/health docs expect `/v1` `/v2` |
| Legacy SaaS Express | `src/app.ts` + `src/routes/*` | **Yes** — current production HTTP |
| Intelligence Playground | `src/platform/intelligence/playground/routes/route-manifest.ts` | **No** (`enabledInM0: false`) |

Related artifacts in this folder:

- [OPENAPI.yaml](./OPENAPI.yaml) / [OPENAPI.json](./OPENAPI.json)
- [POSTMAN_COLLECTION.json](./POSTMAN_COLLECTION.json)
- [INSOMNIA_COLLECTION.json](./INSOMNIA_COLLECTION.json)
- [ROUTE_MAP.md](./ROUTE_MAP.md)
- [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)
- [AUTHENTICATION_GUIDE.md](./AUTHENTICATION_GUIDE.md)
- [ERROR_CODES.md](./ERROR_CODES.md)
- [SDK_GENERATION_GUIDE.md](./SDK_GENERATION_GUIDE.md)
- [VERSIONING_GUIDE.md](./VERSIONING_GUIDE.md)
- [MISSING_API_REPORT.md](./MISSING_API_REPORT.md)

---

## 1. Enterprise API Gateway (`/v1` and `/v2`)

Paths below are relative to `/{version}`. **v2 mirrors v1.** Auth and RBAC permissions are listed.

Envelope:

```json
{ "data": {}, "meta": {} }
```

Errors:

```json
{ "error": { "code": "string", "message": "string", "details": {} } }
```

### Health & auth

| Method | Path | Auth | Permissions | Request | Response |
|--------|------|------|-------------|---------|----------|
| GET | `/health` | No | — | — | health payload |
| POST | `/auth/login` | No | — | `{ email, password, organizationId, deviceId, scheme? }` | `IssuedToken` |
| POST | `/auth/api-keys` | Yes | `admin:*` | `{ name, roles? }` | API key record |

### Tenancy

| Method | Path | Auth | Permissions | Request |
|--------|------|------|-------------|---------|
| POST | `/organizations` | Yes | `org:write` | `{ name }` |
| GET | `/organizations/{organizationId}` | Yes | `org:read` | — |
| POST | `/workspaces` | Yes | `workspace:write` | `{ organizationId, name }` |
| GET | `/workspaces?organizationId=` | Yes | `workspace:read` | query |
| POST | `/users` | Yes | `org:write` | `{ email, displayName, organizationId, roles? }` |
| POST | `/projects` | Yes | `workspace:write` | `{ organizationId, workspaceId, name }` |

### Catalog

| Method | Path | Permissions |
|--------|------|-------------|
| GET | `/capabilities` | `capability:read` |
| GET | `/providers` | `provider:read` |
| GET | `/models` | `provider:read` |
| GET | `/benchmarks` | `benchmark:read` |

### Executions (Intelligence OS entry via Gateway only)

| Method | Path | Permissions | Notes |
|--------|------|-------------|-------|
| POST | `/executions` | `execution:create` | Body: `prompt`, `organizationId`, optional `workspaceId`, `capabilityId`, budgets, `stream`, `metadata` |
| GET | `/executions` | `execution:read` | History (tenant-scoped) |
| GET | `/executions/{executionId}` | `execution:read` | Details |
| POST | `/executions/{executionId}/cancel` | `execution:cancel` | |
| POST | `/executions/{executionId}/retry` | `execution:retry` | |
| GET | `/executions/{executionId}/stream` | `execution:stream` | SSE-shaped frames in JSON envelope |
| GET | `/executions/{executionId}/artifacts` | `execution:read` | |
| GET | `/executions/{executionId}/diagnostics` | `execution:read` | |
| GET | `/executions/{executionId}/trace` | `execution:read` | |
| GET | `/executions/{executionId}/cost` | `execution:read` | |
| GET | `/executions/{executionId}/cost-breakdown` | `execution:read` | Cost line items (no secrets) |
| GET | `/executions/{executionId}/evaluation` | `execution:read` | |
| GET | `/executions/{executionId}/experience` | `execution:read` | |
| GET | `/executions/{executionId}/model-decision` | `execution:read` | Why model selected / rejected |
| GET | `/executions/{executionId}/routing` | `execution:read` | Negotiation + routing |
| GET | `/executions/{executionId}/planning` | `execution:read` | Intent / agents / plan |
| GET | `/executions/{executionId}/timeline` | `execution:read` | Stage timeline |
| GET | `/executions/{executionId}/provider` | `execution:read` | Provider selection |
| GET | `/executions/{executionId}/metrics` | `execution:read` | Latency metrics |
| GET | `/executions/{executionId}/tokens` | `execution:read` | Token usage |
| GET | `/executions/{executionId}/quality` | `execution:read` | Quality / compliance |
| GET | `/executions/{executionId}/confidence` | `execution:read` | Confidence bands |
| GET | `/executions/{executionId}/audit` | `execution:read` | Immutable audit |
| GET | `/executions/{executionId}/decision-graph` | `execution:read` | Decision graph summary |

**Counts:** 47 paths × 2 versions = **94** Gateway routes.

### Platform summaries (thin / stub list handlers)

| Method | Path | Permissions |
|--------|------|-------------|
| GET | `/analytics/summary` | `analytics:read` |
| GET | `/billing/summary` | `billing:read` |
| GET | `/notifications` | `notification:read` |
| GET | `/audit` | `audit:read` |
| POST | `/files` | `file:upload` |
| GET | `/files/{fileId}` | `file:read` |
| GET | `/reviews` | `review:read` |
| POST | `/webhooks` | `org:write` |
| GET | `/brand-profiles` | `org:read` |
| GET | `/knowledge-bases` | `workspace:read` |

---

## 2. Legacy Express SaaS (live today)

Base: Express `src/app.ts`. Auth: Firebase/`VerifyUserHandler` + `VerifyRole` (not Gateway RBAC).

### Auth `/auth`

| Method | Path |
|--------|------|
| GET | `/auth/verify` |
| POST | `/auth/register` |
| POST | `/auth/register-login` |
| POST | `/auth/logout` |
| POST | `/auth/register-fcm` |
| POST | `/auth/forget-password` |
| POST | `/auth/send-email-verification` |
| GET | `/auth/verify-email` |

### Organizations / Teams / Users / Staff

See [ROUTE_MAP.md](./ROUTE_MAP.md) § Legacy for the full table (organizations, teams, users, staff, categories).

### Work products

`/requirement/*`, `/projects/*`, `/tasks/*`, `/packages/*`, `/dashboard/*`, `/chat/*`

### Billing

`/subscription/*` (Stripe-oriented), `/plans/*`, `/razorpay/*` (+ webhook)

### Notifications

`/notification/`, `/notification/send`, `/notification/send/email`

### System

`GET /`

---

## 3. Internal platforms (no dedicated HTTP)

These exist as programmatic engines and are **not** redesigned here. Frontends must not call them directly:

| Platform | Path | How to reach from clients |
|----------|------|---------------------------|
| Intelligence OS | `src/platform/intelligence` | Gateway `POST /v1/executions` only |
| Brand Brain | `src/platform/business/brand-brain` | No public REST today — see MISSING report |
| Knowledge Intelligence | `src/platform/business/knowledge-intelligence` | Thin `/brand-profiles`, `/knowledge-bases` only |
| Business Platform | `src/platform/business` | Partial via Gateway + Legacy Express |
| Studio Engine | `src/platform/studio` | Contracts only; executions via Gateway |
| Persistence | `src/platform/persistence` | No HTTP |
| Multi-Provider / Production | `src/platform/production` | Via Gateway catalogs |

---

## 4. Streaming

| Capability | Existing exposure |
|------------|-------------------|
| SSE-shaped execution stream | `GET /v1/executions/{id}/stream` (and `/v2`) |
| WebSocket execution | Documented transport type in contracts; **no** native WS server mounted |
| Progress / live execution | Same stream route (status/chunk/done frames) |
| Provider-specific streaming | **Not exposed** (correct) |
| Chat realtime | GetStream WebSocket (external); token via `GET /chat/token` |

---

## 5. Authorization summary

| Surface | Mechanism |
|---------|-----------|
| Gateway | Bearer JWT / session / oauth / service token **or** `x-api-key`; RBAC permissions on routes; tenant/org isolation in pipeline |
| Legacy | `VerifyUserHandler` + role lists (`admin`, `superadmin`, `customer`, `servicing`, `resource`) |

See [AUTHENTICATION_GUIDE.md](./AUTHENTICATION_GUIDE.md).
