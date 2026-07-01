# Demo Seed Data

Populate a fresh MongoDB database with realistic demo data so the Expo mobile app shows content across all screens.

## Prerequisites

1. **MongoDB** — `DB_URI` in `.env` pointing to your target database
2. **Firebase Admin** — `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
3. **Stream Chat** — `getstream_io_key`, `getstream_io_secret`
4. **Razorpay test mode** — set `RAZORPAY_MODE=test` (demo subscriptions use fake IDs, no live Razorpay calls)

Optional:

- `DEMO_USER_PASSWORD` — defaults to `DemoPass123!`
- `DEMO_SEED_MODE=true` — enables demo subscription/invoice API bypass (also enabled when `RAZORPAY_MODE=test`)

## Quick start (local)

```bash
# 1. Ensure .env is configured
cp .env.example .env   # if needed

# 2. Seed the database
npm run seed:demo

# 3. Start the API (separate terminal)
npm run dev

# 4. Verify endpoints
npm run seed:verify
```

## Staging / remote database

Point `DB_URI` at your staging cluster, then run the same seed command from your machine or CI:

```bash
DB_URI="mongodb+srv://..." npm run seed:demo
```

Ensure Firebase Admin credentials match the Firebase project the mobile app uses (`unagency-app`). Demo users are created in that Firebase project via Admin SDK.

## Demo account credentials

| Email | Role | Purpose |
|-------|------|---------|
| `demo@unagency.test` | customer | **Primary mobile test account** |
| `rm@unagency.test` | servicing (RM) | Relationship manager chat |
| `teammate@unagency.test` | customer | Accepted team member |
| `invitee@unagency.test` | customer | Pending team invitation |

**Password (all accounts):** `DemoPass123!` (or value of `DEMO_USER_PASSWORD`)

Log in on the Expo app with `demo@unagency.test` / `DemoPass123!`.

## What gets seeded

| # | Entity | Count | Notes |
|---|--------|-------|-------|
| 1 | Categories | 10 | 2 popular, 2 bestseller, 6 standard |
| 2 | Razorpay plans | 5 | trial, bronze, silver, gold, platinum |
| 3 | Users | 4 | Firebase + MongoDB + Stream |
| 4 | Staff | 1 | RM profile for `rm@unagency.test` |
| 5 | Subscription | 1 | Active gold plan for demo user |
| 6 | Organization | 1 | Demo Creative Studio |
| 7 | Team members | 3 | owner, accepted member, pending invite |
| 8 | Requirements | 4 | Briefs for demo user |
| 9 | Projects | 6 | All progress statuses (planning → closed) |
| 10 | Notifications | 7 | PROJECT + COMMON types |
| 11 | Stream channel | 1 | RM chat with 5 messages |
| 12 | Payments | 3 | Captured history + PDF invoice support |

All demo data is namespaced (`@unagency.test` emails, `[Demo]` titles, `plan_demo_*` / `sub_demo_*` / `pay_demo_*` IDs).

## Idempotency

Safe to run multiple times. The script upserts by:

- Category `title`
- Plan `plan_id`
- User `email`
- Organization `owner`
- Team `(Organization, userId)`
- Requirement / project `title`
- Notification `(userId, title)`
- Payment `razorpay_payment_id`

Re-running updates existing records rather than duplicating.

## Reset

Remove all demo data and re-seed:

```bash
npm run seed:demo:reset
npm run seed:demo
```

Reset deletes:

- Firebase users with `@unagency.test` emails
- Stream users/channels for demo users
- All related MongoDB documents
- Demo categories and plans

## Verification

```bash
# Auto sign-in with demo credentials (needs FIREBASE_API_KEY or apiKey in .env)
npm run seed:verify

# Or pass a Firebase ID token directly
DEMO_FIREBASE_TOKEN=eyJ... npm run seed:verify
```

Manual curl examples:

```bash
# Get Firebase token
TOKEN=$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@unagency.test","password":"DemoPass123!","returnSecureToken":true}' \
  | jq -r .idToken)

# Hit endpoints
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/categories | jq '.data | length'
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/razorpay/subscriptions/current | jq '.data.status'
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/projects | jq '.data | length'
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/chat/token | jq '.data.token != null'
```

## Razorpay dev-mode notes

Demo subscriptions use IDs prefixed with `sub_demo_` and are stored directly in MongoDB. No Razorpay checkout is required.

When `RAZORPAY_MODE=test` (or `DEMO_SEED_MODE=true`):

- `GET /razorpay/subscriptions/current` returns the seeded subscription from MongoDB
- `GET /razorpay/invoice/:paymentId` generates a PDF for `pay_demo_*` payment IDs without calling Razorpay

For production-like Razorpay testing, create real test-mode plans in the Razorpay dashboard and sync via `POST /razorpay/plans`.

## Mobile E2E checklist

After seeding, log in as `demo@unagency.test`:

- [ ] Home — categories in Popular, Best Seller, and All sections
- [ ] Categories tab — full grid with images
- [ ] Membership — plans listed; current plan shows active (gold)
- [ ] Create brief — not blocked by membership
- [ ] See brief — 3+ past requirements
- [ ] Projects — 4+ projects in various statuses
- [ ] Chats — at least 1 RM channel with messages
- [ ] Business hub — company profile populated
- [ ] Invitations — pending invite for `invitee@unagency.test`
- [ ] Notifications — 5+ items with action buttons
- [ ] Invoice history — 2+ payments with downloadable invoices

## Invitee account

Log in as `invitee@unagency.test` to test the pending team invitation flow (`GET /teams/my-invitation`).
