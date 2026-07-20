# Billing Model

| Entity | Notes |
|--------|------|
| Plan | free / starter / growth / enterprise + monthly credits |
| Subscription | status lifecycle (trialing/active/past_due/cancelled/paused) |
| Credits | ledger + running balance; signup bonus; subscription grants |
| Invoice | open/paid/void — amounts only |
| Transaction | charge/credit/refund/adjustment; `gateway: "none"` |

**No payment processor** in this milestone. Ready for Stripe/Razorpay adapters later.
