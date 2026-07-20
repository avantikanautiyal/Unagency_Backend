# Route Map

Canonical path inventory. **Do not duplicate routes.** Source files cited.

## A. Enterprise API Gateway

**File:** `src/platform/api/routes/route-map.ts`  
**Versions:** `/v1/*` and `/v2/*` (identical paths)

| Method | Path | Domain | Auth | Permissions |
|--------|------|--------|------|-------------|
| GET | `/{v}/health` | health | no | — |
| POST | `/{v}/auth/login` | authentication | no | — |
| POST | `/{v}/auth/api-keys` | authentication | yes | `admin:*` |
| POST | `/{v}/organizations` | organizations | yes | `org:write` |
| GET | `/{v}/organizations/:organizationId` | organizations | yes | `org:read` |
| POST | `/{v}/workspaces` | workspaces | yes | `workspace:write` |
| GET | `/{v}/workspaces` | workspaces | yes | `workspace:read` |
| POST | `/{v}/users` | users | yes | `org:write` |
| POST | `/{v}/projects` | projects | yes | `workspace:write` |
| GET | `/{v}/capabilities` | capabilities | yes | `capability:read` |
| GET | `/{v}/providers` | providers | yes | `provider:read` |
| GET | `/{v}/models` | models | yes | `provider:read` |
| POST | `/{v}/executions` | executions | yes | `execution:create` |
| GET | `/{v}/executions` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId` | executions | yes | `execution:read` |
| POST | `/{v}/executions/:executionId/cancel` | executions | yes | `execution:cancel` |
| POST | `/{v}/executions/:executionId/retry` | executions | yes | `execution:retry` |
| GET | `/{v}/executions/:executionId/stream` | executions | yes | `execution:stream` |
| GET | `/{v}/executions/:executionId/artifacts` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/diagnostics` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/trace` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/cost` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/cost-breakdown` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/evaluation` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/experience` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/model-decision` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/routing` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/planning` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/timeline` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/provider` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/metrics` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/tokens` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/quality` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/confidence` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/audit` | executions | yes | `execution:read` |
| GET | `/{v}/executions/:executionId/decision-graph` | executions | yes | `execution:read` |
| GET | `/{v}/benchmarks` | benchmarks | yes | `benchmark:read` |
| GET | `/{v}/analytics/summary` | analytics | yes | `analytics:read` |
| GET | `/{v}/billing/summary` | billing | yes | `billing:read` |
| GET | `/{v}/notifications` | notifications | yes | `notification:read` |
| GET | `/{v}/audit` | audit | yes | `audit:read` |
| POST | `/{v}/files` | files | yes | `file:upload` |
| GET | `/{v}/files/:fileId` | files | yes | `file:read` |
| GET | `/{v}/reviews` | human_reviews | yes | `review:read` |
| POST | `/{v}/webhooks` | webhooks | yes | `org:write` |
| GET | `/{v}/brand-profiles` | brand_profiles | yes | `org:read` |
| GET | `/{v}/knowledge-bases` | knowledge_bases | yes | `workspace:read` |

**Pipeline:** versioning → validation → authentication → authorization → tenant isolation → rate limits → controller → serialization (`src/platform/api/middleware/pipeline.ts`).

**Dispatch:** `src/platform/api/controllers/dispatch.ts`

---

## B. Legacy Express SaaS

**File:** `src/app.ts`

| Mount | Router |
|-------|--------|
| `/razorpay/webhook` | `src/webhook/razorpaywebhook.ts` |
| `/auth` | `src/routes/auth.route.ts` |
| `/dashboard` | `src/routes/dashboard.route.ts` |
| `/categories` | `src/routes/categories.route.ts` |
| `/users` | `src/routes/users.route.ts` |
| `/organizations` | `src/routes/organizations.route.ts` |
| `/teams` | `src/routes/teams.route.ts` |
| `/requirement` | `src/routes/requirement.route.ts` |
| `/staff` | `src/routes/staff.route.ts` |
| `/chat` | `src/routes/chat.route.ts` |
| `/projects` | `src/routes/project.route.ts` |
| `/packages` | `src/routes/packages.route.ts` |
| `/tasks` | `src/routes/tasks.route.ts` |
| `/subscription` | `src/routes/subscription.route.ts` |
| `/plans` | `src/routes/plan.routes.ts` |
| `/notification` | `src/routes/notification.route.ts` |
| `/razorpay` | `src/routes/razorpay.route.ts` |
| `/` | `src/routes/hello.route.ts` |

### Mounted legacy endpoints

| Method | Full path |
|--------|-----------|
| GET | `/auth/verify` |
| POST | `/auth/register` |
| POST | `/auth/register-login` |
| POST | `/auth/logout` |
| POST | `/auth/register-fcm` |
| POST | `/auth/forget-password` |
| POST | `/auth/send-email-verification` |
| GET | `/auth/verify-email` |
| GET | `/dashboard/customer-project-count` |
| POST | `/categories/` |
| GET | `/categories/` |
| DELETE | `/categories/:categoryId` |
| PUT | `/categories/:categoryId` |
| POST | `/users/create-user` |
| POST | `/users/update-user` |
| POST | `/users/update-internal-user` |
| GET | `/users/fetch-customers` |
| GET | `/users/fetch-customer/:customer` |
| GET | `/users/fetch-customer-plan/:customer` |
| GET | `/users/fetch-resource` |
| GET | `/users/fetch-internal-team` |
| POST | `/users/search` |
| GET | `/users/disable-user/:firebaseID` |
| GET | `/users/enable-user/:firebaseID` |
| GET | `/users/:id` |
| POST | `/users/update-tour-completion` |
| POST | `/organizations/` |
| POST | `/organizations/update/:organizationId` |
| GET | `/organizations/user-organization` |
| GET | `/organizations/:userId` |
| POST | `/teams/invite-member` |
| PATCH | `/teams/invite-action` |
| GET | `/teams/my-invitation` |
| POST | `/teams/remove-member` |
| GET | `/teams/fetch-team` |
| GET | `/teams/client-team/:organizationId` |
| POST | `/requirement/create` |
| GET | `/requirement/` |
| GET | `/requirement/get/:id` |
| GET | `/requirement/:userId` |
| POST | `/requirement/:reqId/:userId/:status` |
| POST | `/staff/` |
| GET | `/staff/` |
| GET | `/staff/:id` |
| POST | `/staff/update/:id` |
| DELETE | `/staff/delete/:id` |
| POST | `/staff/assign-manager` |
| GET | `/chat/token` |
| POST | `/chat/create-channel` |
| GET | `/chat/myRMChat` |
| POST | `/chat/add-member-in-chat-room` |
| POST | `/chat/remove-member-from-chat-room` |
| POST | `/chat/send-automate-message` |
| GET | `/projects/` |
| POST | `/projects/` |
| GET | `/projects/assigned-projects` |
| GET | `/projects/client/:userId` |
| GET | `/projects/:projectId` |
| POST | `/projects/update/:projectId` |
| GET | `/projects/logs/:projectId` |
| GET | `/projects/update-log/:customerId/:projectId/:stage` |
| GET | `/packages/` |
| POST | `/packages/` |
| GET | `/packages/:id` |
| POST | `/packages/update/:id` |
| POST | `/packages/delete/:id` |
| POST | `/tasks/` |
| GET | `/tasks/` |
| GET | `/tasks/kanban` |
| GET | `/tasks/:userId` |
| PUT | `/tasks/update/:taskId` |
| GET | `/tasks/task-by-id/:id` |
| POST | `/subscription/create-checkout-session` |
| GET | `/subscription/subscription-status` |
| GET | `/subscription/fetch-checkout-session` |
| POST | `/subscription/create-user-subscription` |
| GET | `/subscription/payment-methods` |
| POST | `/subscription/create-payment-method` |
| POST | `/subscription/make-default-payment-method` |
| POST | `/subscription/remove-payment-method` |
| GET | `/subscription/invoice-history` |
| GET | `/plans/` |
| GET | `/plans/check-limit` |
| GET | `/plans/check-limit/:userId` |
| PUT | `/plans/:id` |
| GET | `/notification/` |
| POST | `/notification/send` |
| POST | `/notification/send/email` |
| POST | `/razorpay/subscriptions/create` |
| POST | `/razorpay/subscriptions/update` |
| POST | `/razorpay/subscriptions/cancel-update` |
| POST | `/razorpay/subscriptions/cancel` |
| GET | `/razorpay/subscriptions` |
| GET | `/razorpay/subscriptions/current` |
| GET | `/razorpay/subscriptions/customer/:userId` |
| POST | `/razorpay/paymentVerification` |
| POST | `/razorpay/paymentVerificationapp` |
| GET | `/razorpay/payment/history` |
| GET | `/razorpay/payment/history/:userId` |
| GET | `/razorpay/invoice/:paymentId` |
| GET | `/razorpay/plans` |
| POST | `/razorpay/plans` |
| PUT | `/razorpay/plans/:plan_id` |
| DELETE | `/razorpay/plans/:plan_id` |
| POST | `/razorpay/webhook` |
| GET | `/` |

### Defined but not mounted

| File | Notes |
|------|-------|
| `src/routes/stripe.route.ts` | Not `app.use`'d |

### Future / disabled

| Path | Status |
|------|--------|
| `/intelligence/playground/*` | Manifest only, not mounted |

---

## C. No HTTP (programmatic only)

Brand Brain, Knowledge Intelligence (full graph APIs), Studio Engine, Persistence admin, Multi-Provider internals, full Business Platform domains — see [MISSING_API_REPORT.md](./MISSING_API_REPORT.md).
