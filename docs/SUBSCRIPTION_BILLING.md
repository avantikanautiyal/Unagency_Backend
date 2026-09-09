# Unagency Subscription Billing (Razorpay Test Mode)

Application-side subscription system for the six existing Razorpay **Test Mode** plans.
Razorpay is the billing provider; Unagency is the source of truth for entitlements.

## Environment variables

Configured in `unagency-backend/.env` (see `.env.example`). **Never commit secrets.**

| Variable | Purpose |
|----------|---------|
| `RAZORPAY_KEY` / `RAZORPAY_KEY_ID` | Public Test key (safe to return to checkout UI) |
| `RAZORPAY_SECRET` / `RAZORPAY_KEY_SECRET` | Server-only secret for signatures |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret (Dashboard → Webhooks) |
| `RAZORPAY_MODE=test` | Keep Test Mode |
| `RAZORPAY_PLAN_UNAGENCY_AI_MONTHLY` | Existing Razorpay Plan ID |
| `RAZORPAY_PLAN_UNAGENCY_HYBRID_MONTHLY` | Existing Razorpay Plan ID |
| `RAZORPAY_PLAN_UNAGENCY_HUMAN_MONTHLY` | Existing Razorpay Plan ID |
| `RAZORPAY_PLAN_UNAGENCY_AI_ANNUAL` | Existing Razorpay Plan ID |
| `RAZORPAY_PLAN_UNAGENCY_HYBRID_ANNUAL` | Existing Razorpay Plan ID |
| `RAZORPAY_PLAN_UNAGENCY_HUMAN_ANNUAL` | Existing Razorpay Plan ID |
| `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY` | Recurring cycles (default `120`) |
| `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_ANNUAL` | Recurring cycles (default `10`) |

Plan IDs live **only** in env + DB mapping. The frontend never sends Razorpay Plan IDs.

## Internal plan codes

- `UNAGENCY_AI_MONTHLY` / `UNAGENCY_HYBRID_MONTHLY` / `UNAGENCY_HUMAN_MONTHLY`
- `UNAGENCY_AI_ANNUAL` / `UNAGENCY_HYBRID_ANNUAL` / `UNAGENCY_HUMAN_ANNUAL`

Canonical pricing + entitlements: `src/billing/plan-catalog.ts`.

## Sync local plan rows (does not create Razorpay plans)

```bash
cd unagency-backend
npm run sync:plans
```

`POST/PUT/DELETE /razorpay/plans` require `admin` / `superadmin`. Prefer `npm run sync:plans` over the HTTP plan-mutation endpoints.

## API flow

1. `GET /razorpay/plans?billingPeriod=monthly|annual` — authenticated optional; returns catalog-backed plans.
2. `POST /razorpay/subscriptions/create` `{ "planCode": "UNAGENCY_HYBRID_MONTHLY" }` — requires auth.
   - Resolves env Plan ID → creates Razorpay Subscription → stores local pending/created row.
   - Returns `{ subscriptionId, razorpayKeyId, planCode, ... }` (no secrets).
3. Frontend opens Razorpay Checkout with `subscription_id` + public key.
4. `POST /razorpay/paymentVerificationapp` — verifies checkout signature server-side.
5. `POST /razorpay/webhook` — raw body + `X-Razorpay-Signature`; authoritative lifecycle + credit allocation.
6. `POST /razorpay/subscriptions/cancel` — cancel at Razorpay + local state (records retained).

## Webhook

- URL: `{BACKEND_URL}/razorpay/webhook`
- Verify with raw body + `RAZORPAY_WEBHOOK_SECRET`
- Idempotency: `razorpay_webhook_events` collection (Mongo)
- Events: authenticated, activated, charged, pending, halted, cancelled, completed, expired, paused, resumed, updated (+ payment.*)
- Credits allocated on `subscription.activated` / `subscription.charged` (idempotent keys; Human plans = N/A)

## Entitlements & credits

- Service: `src/billing/entitlement-service.ts`
- Credits: `src/billing/credit-service.ts` + `credit_balances` / `credit_ledger`
- Brand limit enforced in `brand-service` create
- Storage limit enforced in `product-asset-service` upload
- Projects: unlimited for all six plans

## Ownership

Subscriptions attach to the authenticated **user** (`Users.subscription` + `Subscriptions.userId`), consistent with the existing architecture. Organization ID is stored when available on the user.

## Cancellation

Uses existing `POST /razorpay/subscriptions/cancel` (cancel at cycle end via Razorpay `cancel(id, true)`). Local row is updated, not deleted.

## Upgrade / downgrade

`POST /razorpay/subscriptions/update` accepts `planCode` only and schedules Razorpay plan change (`schedule_change_at: "now"`). Entitlements refresh via webhook `subscription.updated` / subsequent charge. Do not treat a local row edit as billing change.

## Testing

```bash
cd unagency-backend
npm test -- tests/billing/plan-catalog-entitlements.test.ts
```

## Test → Live considerations

1. Create matching Live Mode plans in Razorpay (do not reuse Test Plan IDs).
2. Replace env keys + plan IDs + webhook secret for Live.
3. Set `RAZORPAY_MODE=live` only after verifying webhook URL on Live.
4. Never put Live secrets in frontend or docs.
5. Re-run `sync-unagency-plans.ts` against Live IDs.

## Manual Razorpay Dashboard checklist

- [ ] Webhook URL points to `/razorpay/webhook` with subscription + payment events enabled
- [ ] Webhook secret matches `RAZORPAY_WEBHOOK_SECRET`
- [ ] Test Mode keys active while developing
- [ ] Six plans already exist — do not recreate
