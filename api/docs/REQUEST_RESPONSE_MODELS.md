# Request & Response Models

Key contracts already defined in the platform (inventory — not redesign).

## Gateway envelopes

| Model | Location |
|-------|----------|
| `ApiRequest` / `ApiResponse` | `src/platform/api/contracts/http.ts` |
| `ApiSuccessBody` / `ApiErrorBody` | same |
| `RouteDefinition` | same |

## Auth

| Model | Location |
|-------|----------|
| `IssuedToken` | `src/platform/api/contracts/auth.ts` |
| `AuthPrincipal` / `AuthSession` / `ApiKeyRecord` | same |

### Login request

```ts
{
  email: string;
  password: string;
  organizationId: string;
  deviceId: string;
  scheme?: "jwt" | "oauth" | "session";
}
```

## Executions

| Model | Location |
|-------|----------|
| `CreateExecutionRequest` | `src/platform/api/contracts/execution.ts` |
| `ExecutionResource` | same |
| `ExecutionArtifactRef` | same |
| `ExecutionDiagnostics` | same |
| `ExecutionTraceSummary` | same |
| `ExecutionCostSummary` | same |
| `ExecutionEvaluationSummary` | same |
| `ExecutionExperienceSummary` | same |

### Create execution request

```ts
{
  prompt: string;
  organizationId: string;
  workspaceId?: string;
  projectId?: string;
  capabilityId?: string;
  budgetLimit?: number;
  tokenBudgetLimit?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}
```

## Execution intelligence (explainability) — REMOVED

The `src/platform/api/execution-intelligence` module and its explainability routes
(`/model-decision`, `/routing`, `/planning`, `/quality`, `/confidence`, `/decision-graph`, etc.)
were deleted. Do not wire clients to them.

Live post-create OS surfaces that remain: refinement, human review, delivery, and
execution diagnostics embedded on the execution resource itself.
## Streaming

| Model | Location |
|-------|----------|
| Stream subscription / frames | `src/platform/api/contracts/streaming.ts` |
| Service | `src/platform/api/streaming/in-memory-streaming-service.ts` |

## Catalog / tenants

Resolved via Gateway services:

- Capabilities / providers / models — `src/platform/api/services/catalog-api-service.ts`
- Organizations / workspaces / users / projects — `src/platform/api/tenants/*`

## Brand / knowledge metadata (thin path)

Do **not** attach Brand Brain / Knowledge enrichment packages on create.
Use structured brand binding metadata (`brandBindingMode`, `brandId`, `brandName`,
`brandColors`) via `withThinDirectExecutionMetadata` / server thin passthrough.
Prompt wrappers and enrichment novel IDs are gone.

Full OpenAPI component schemas: [OPENAPI.yaml](./OPENAPI.yaml) `#/components/schemas`.
