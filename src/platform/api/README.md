# Enterprise API Gateway & Platform Services

Sole external entry point for UNAGENCY frontends and SDKs. Execution flows through
`DirectExecutionEngine` → provider runtime (see `src/platform/direct/`).

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

Canonical API documentation lives under `api/docs/` at the repository root:

- `api/docs/MASTER_API_REFERENCE.md`
- `api/docs/FRONTEND_INTEGRATION_GUIDE.md`
- `api/docs/ROUTE_MAP.md`

Route source of truth: `src/platform/api/routes/route-map.ts`.

## Key endpoints

| Path | Purpose |
|------|---------|
| `POST /v1/executions` | Create execution (thin/direct provider path) |
| `GET /v1/runtime/capabilities` | Executable capability availability |
| `GET /v1/os/refinements…` | Structured refinement (live) |
| `GET /v1/os/reviews…` | Human review (live) |

Explainability / execution-intelligence HTTP surface was removed. Do not document or call `/model-decision`, `/intelligence/*`, or TaskGraph routes — they are gone.
