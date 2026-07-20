# API Usage Guide

Business Platform never calls Runtime/Routing/Providers.

## AI execution

```ts
import { createBusinessPlatform } from "../index";

const platform = createBusinessPlatform();
// Login via Enterprise API (same seed org)
const token = /* POST /v1/auth/login */;

await platform.engine.requestExecution({
  organizationId: platform.seed!.organizationId,
  requestedByUserId: platform.seed!.userId,
  prompt: "Draft a campaign brief",
  gatewayAccessToken: token, // required
});
```

## Rules

1. `gatewayAccessToken` is mandatory for AI — empty token fails closed.
2. Credits are consumed per request at the business layer.
3. `BusinessExecutionRecord.gatewayExecutionId` links to API execution resources.
4. Frontends should prefer Business Platform APIs for SaaS state; use Enterprise API only via this layer for intelligence work (or directly if building thin clients that skip business features).
