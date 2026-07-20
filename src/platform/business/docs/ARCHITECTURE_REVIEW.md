# Business Platform — Architecture Review

## Verdict

SaaS product layer under `src/platform/business/`. Sits **above** the Intelligence
Operating System. Does **not** execute AI.

## Boundary

```
React Native / Web / Admin / Client Portal
                ↓
         Enterprise API Gateway  ←── Business Platform AI calls (only path)
                ↓
         Intelligence OS (frozen)
```

Business domains (orgs, brands, campaigns, billing, …) are first-class SaaS
state. Whenever generation is required, `GatewayExecutionClient` calls
`POST /v1/executions` on the Enterprise API Gateway with a bearer token.

## Non-goals

No Intelligence / Infrastructure / Multi-Provider / API Gateway redesign.
No payment gateway. No React Native / Web UI in this milestone.
