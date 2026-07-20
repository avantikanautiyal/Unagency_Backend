# Enterprise API Gateway & Platform Services

Sole external entry point for UNAGENCY frontends and SDKs.

**Not** part of the Intelligence Operating System.

## Usage

```ts
import { createEnterpriseApiPlatform } from "./index";

const { gateway, seed } = createEnterpriseApiPlatform();

const login = await gateway.handle({
  requestId: "r1",
  method: "POST",
  path: "/v1/auth/login",
  version: "v1",
  headers: {},
  body: {
    email: "admin@unagency.local",
    password: "admin",
    organizationId: seed!.organizationId,
    deviceId: "ios-1",
  },
});
```

## Docs

1. [Architecture Review](./docs/ARCHITECTURE_REVIEW.md)
2. [API Specification](./docs/API_SPECIFICATION.md)
3. [OpenAPI Specification](./docs/OPENAPI_SPECIFICATION.md)
4. [Route Map](./docs/ROUTE_MAP.md)
5. [Authentication Model](./docs/AUTHENTICATION_MODEL.md)
6. [Multi-Tenant Model](./docs/MULTI_TENANT_MODEL.md)
7. [Streaming Model](./docs/STREAMING_MODEL.md)
8. [SDK Generation Guide](./docs/SDK_GENERATION_GUIDE.md)
9. [Dependency Graph](./docs/DEPENDENCY_GRAPH.md)
10. [Unit Tests](./docs/UNIT_TESTS.md)
11. [Integration Tests](./docs/INTEGRATION_TESTS.md)
12. [ACP Report](./docs/ACP_REPORT.md)

## Non-goals

No Intelligence OS redesign. No React Native / Web app work in this milestone.
