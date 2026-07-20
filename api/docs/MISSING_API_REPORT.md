# Missing API Report

**Milestone rule:** Do **not** implement these endpoints here. Inventory only.

This report lists frontend/product domain capabilities that exist **internally** (or are expected by product domains) but are **not** fully exposed as dedicated HTTP routes on the Enterprise API Gateway today. Thin stubs are noted where a list route exists but lacks domain CRUD.

---

## Auth gaps (Gateway)

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Refresh token | Long-lived mobile sessions without re-login | `POST /v1/auth/refresh` | `{ refreshToken }` | `IssuedToken` |
| Logout / revoke | Invalidate session/API session at Gateway | `POST /v1/auth/logout` | optional `{ sessionId }` | `{ revoked: true }` |
| Forgot password | Password recovery on Gateway surface | `POST /v1/auth/forgot-password` | `{ email, organizationId }` | `{ accepted: true }` |
| Reset password | Complete recovery | `POST /v1/auth/reset-password` | `{ token, newPassword }` | `{ reset: true }` |
| Profile | Fetch/update current principal profile | `GET/PATCH /v1/auth/me` | patch body | profile resource |
| Session list/revoke | Multi-device session management | `GET/DELETE /v1/auth/sessions` | — | session list |
| OAuth authorize/callback | Full OAuth redirect flow | `GET /v1/auth/oauth/{provider}/…` | provider params | redirect / token |
| Service accounts CRUD | Non-human principals beyond API keys | `POST/GET /v1/service-accounts` | name, roles | service account |

> Legacy Express already covers several auth UX flows under `/auth/*` (register, forget-password, verify-email, logout). Missing items above are **Gateway** gaps for a unified platform client.

---

## Organizations / RBAC gaps

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Update / delete organization | Org lifecycle | `PATCH/DELETE /v1/organizations/{id}` | settings patch | org resource |
| Organization settings | Feature flags, locale, billing owner | `GET/PATCH /v1/organizations/{id}/settings` | settings | settings |
| Departments | Org structure | `CRUD /v1/organizations/{id}/departments` | name | department |
| Teams (Gateway) | Collaboration units | `CRUD /v1/teams` | org, name | team |
| Roles / permissions admin | Custom RBAC | `CRUD /v1/roles` | permissions[] | role |
| Invitations | Invite members via Gateway | `POST /v1/invitations` | email, roles | invitation |
| Members list | Membership directory | `GET /v1/organizations/{id}/members` | — | members[] |

> Legacy Express covers orgs/teams partially under `/organizations`, `/teams`.

---

## Workspace gaps

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Get / update / delete workspace | Full workspace lifecycle | `GET/PATCH/DELETE /v1/workspaces/{id}` | patch | workspace |
| Folders | Navigation hierarchy | `CRUD /v1/workspaces/{id}/folders` | name, parentId | folder |
| Recent activity | Studio “recents” | `GET /v1/workspaces/{id}/activity` | — | activity[] |
| Favorites | Pinned UX | `CRUD /v1/workspaces/{id}/favorites` | target | favorite |
| Search | Cross-resource search | `GET /v1/search` | `q`, filters | hits[] |

---

## Brand Brain gaps

Internal SoT: `src/platform/business/brand-brain`. Gateway only has thin `GET /v1/brand-profiles`.

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Upsert brand brain | Persist org intelligence | `PUT /v1/brand-brain` | `BrandBrainDocument` + changelog | version record |
| Get current / version | Read brain | `GET /v1/brand-brain` / `…/versions/{n}` | — | document |
| List versions / history | Audit | `GET /v1/brand-brain/versions` | — | versions[] |
| Compare / rollback | Version ops | `POST /v1/brand-brain/compare` `POST …/rollback` | from/to | diff / new version |
| Enrichment | Structured context for executions | `POST /v1/brand-brain/enrich` | retrieval query | `BrandBrainEnrichmentPackage` |
| Domain slices | Tone, identity, products, audiences, competitors, personas, campaigns, objectives, guidelines | `GET /v1/brand-brain/{section}` | — | section payload |

---

## Knowledge Intelligence gaps

Internal: `src/platform/business/knowledge-intelligence`. Gateway thin: `GET /v1/knowledge-bases`.

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Sync from Brand Brain | Build graph | `POST /v1/knowledge/sync` | orgId, brandBrainVersion | snapshot |
| Entities / relationships CRUD | Graph edits | `/v1/knowledge/entities` `/relationships` | entity/rel | resource |
| Traversal | Related / path / neighborhood | `GET /v1/knowledge/traverse` | seed, depth | entities/path |
| Context assembly | Execution enrichment | `POST /v1/knowledge/context` | retrieval query | `KnowledgeContextPackage` |
| Search / evidence / snapshots | Discovery + versioning | `/v1/knowledge/search` `/snapshots` | query | results |

---

## Campaigns / prompts / knowledge repository gaps

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Campaign CRUD + status/assets/timeline/analytics | Marketing SaaS | `/v1/campaigns…` | campaign body | campaign |
| Knowledge documents / collections | Repo UX | `/v1/knowledge-documents…` | multipart/meta | document |
| Prompt library templates/variables/versions | Reusable prompts | `/v1/prompt-templates…` | template | template |

> Legacy Express uses `/requirement` and `/projects` for related SaaS workflows — not Brand Brain / Intelligence campaign models.

---

## Executions / evaluation / experience / learning gaps

Gateway already exposes core execution + evaluation/experience **summaries**. Still missing relative to full frontend wishlist:

| Missing Endpoint | Business Reason | Suggested Route | Required Request | Required Response |
|------------------|-----------------|-----------------|------------------|-------------------|
| Dynamic evaluation request | On-demand scoring | `POST /v1/executions/{id}/evaluate` | rubric? | evaluation report |
| Human review submit | Approval loop | `POST /v1/reviews` | executionId, decision | review |
| Experience search / recommendations | Experience intelligence UX | `GET /v1/experiences` | filters | experiences[] |
| Learning signals / optimization trends | Closed-loop learning UX | `GET /v1/learning/signals` | orgId | signals[] |
| Native SSE `text/event-stream` | Browser EventSource | same path, different content-type | — | SSE stream |
| Native WebSocket live execution | Bi-directional progress | `WS /v1/executions/{id}/live` | subscribe | frames |

---

## Providers / models / capabilities gaps

List endpoints exist. Missing detail routes:

| Missing Endpoint | Suggested Route |
|------------------|-----------------|
| Capability details / search | `GET /v1/capabilities/{id}`, `GET /v1/capabilities?q=` |
| Provider details / health / metrics / certification | `GET /v1/providers/{id}`, `…/health`, `…/metrics` |
| Model details / pricing / latency / availability | `GET /v1/models/{id}` |

---

## Marketplace / assets / approvals / notifications / billing / analytics gaps

| Domain | Existing | Missing (representative) |
|--------|----------|--------------------------|
| Marketplace | Legacy `/packages` | Gateway `/v1/marketplace/{templates,workflows,assets}` |
| Assets | Gateway `/files` thin | Images/videos/audio folders/versions downloads |
| Approvals | Gateway `/reviews` thin list | approve/reject/history/comments |
| Notifications | Gateway list + Legacy `/notification` | read/unread/preferences on Gateway |
| Billing | Gateway `/billing/summary` + Legacy Stripe/Razorpay | plans/subscriptions/invoices/credits on Gateway |
| Analytics | Gateway `/analytics/summary` + Legacy dashboard | org/execution/provider/cost reports |

---

## Studio Engine

`src/platform/studio` is contracts/engine only — **by design no HTTP** in Studio milestone. Frontends render Studio state locally or via future BFF. Not listed as defects unless product requires synced Studio state server-side.

---

## Wiring note (not a missing route)

Enterprise Gateway `/v1`/`/v2` is implemented in-process (`gateway.handle`) and documented for nginx, but is **not currently mounted** on the Express app in `src/app.ts`. Frontends relying on Gateway paths need the deployment mounting wire-up (ops), not new route designs.

---

## Summary counts

| Category | Approx. gap items listed |
|----------|--------------------------|
| Auth (Gateway) | 8 |
| Org / RBAC | 7 |
| Workspace | 5 |
| Brand Brain | 6 |
| Knowledge Intelligence | 5 |
| Campaigns / prompts / docs | 3 |
| Executions / learning / streaming transport | 6 |
| Catalog detail | 3 |
| Marketplace / assets / approvals / billing / analytics | many thin |

**This milestone does not implement any of the above.**
