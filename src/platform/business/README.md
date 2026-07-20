# UNAGENCY Business Platform

SaaS product layer above the Intelligence Operating System.

**Does not perform AI execution.** Delegates exclusively through the Enterprise API Gateway.

## Usage

```ts
import { createBusinessPlatform } from "./index";
import { gatewayLogin } from "./testing";

const platform = createBusinessPlatform();
const token = await gatewayLogin(platform);

await platform.engine.createCampaign({
  organizationId: platform.seed!.organizationId,
  workspaceId: platform.seed!.workspaceId,
  name: "Launch",
  objective: "Awareness",
  channels: ["social"],
  deliverables: ["ads"],
  analyticsTags: [],
});

await platform.engine.requestExecution({
  organizationId: platform.seed!.organizationId,
  requestedByUserId: platform.seed!.userId,
  prompt: "Draft launch copy",
  gatewayAccessToken: token,
});
```

## Docs

1. [Architecture Review](./docs/ARCHITECTURE_REVIEW.md)
2. [Business Domain Model](./docs/BUSINESS_DOMAIN_MODEL.md)
3. [Entity Relationship Model](./docs/ENTITY_RELATIONSHIP_MODEL.md)
4. [API Usage Guide](./docs/API_USAGE_GUIDE.md)
5. [SaaS Data Model](./docs/SAAS_DATA_MODEL.md)
6. [Permission Model](./docs/PERMISSION_MODEL.md)
7. [Collaboration Model](./docs/COLLABORATION_MODEL.md)
8. [Billing Model](./docs/BILLING_MODEL.md)
9. [Analytics Model](./docs/ANALYTICS_MODEL.md)
10. [Unit Tests](./docs/UNIT_TESTS.md)
11. [Integration Tests](./docs/INTEGRATION_TESTS.md)
12. [ACP Report](./docs/ACP_REPORT.md)

## Non-goals

No React Native / Web. No Intelligence or Infrastructure redesign. No payment PSP.
