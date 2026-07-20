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

## Execution intelligence (explainability)

Module: `src/platform/api/execution-intelligence`

| Response | Endpoint |
|----------|----------|
| `ModelDecisionResponse` | `GET …/model-decision` |
| `RoutingResponse` | `GET …/routing` |
| `PlanningResponse` | `GET …/planning` |
| `TimelineResponse` | `GET …/timeline` |
| `ProviderResponse` | `GET …/provider` |
| `MetricsResponse` | `GET …/metrics` |
| `TokensResponse` | `GET …/tokens` |
| `CostBreakdownResponse` | `GET …/cost-breakdown` |
| `QualityResponse` | `GET …/quality` |
| `ConfidenceResponse` | `GET …/confidence` |
| `AuditResponse` | `GET …/audit` |
| `DecisionGraphResponse` | `GET …/decision-graph` |

Guarantees: `containsPrompt: false`, `containsSecrets: false`. Never returns raw prompts or API keys.

Contracts: `src/platform/api/execution-intelligence/contracts/responses.ts`
## Streaming

| Model | Location |
|-------|----------|
| Stream subscription / frames | `src/platform/api/contracts/streaming.ts` |
| Service | `src/platform/api/streaming/in-memory-streaming-service.ts` |

## Catalog / tenants

Resolved via Gateway services:

- Capabilities / providers / models — `src/platform/api/services/catalog-api-service.ts`
- Organizations / workspaces / users / projects — `src/platform/api/tenants/*`

## Internal enrichment (not HTTP resources today)

Attach as `metadata` on create execution when orchestration has run:

| Package | Module |
|---------|--------|
| Brand Brain enrichment | `src/platform/business/brand-brain/contracts` |
| Knowledge context | `src/platform/business/knowledge-intelligence/contracts` |
| Studio gateway request | `src/platform/studio/contracts/commands.ts` → `StudioGatewayRequest` |

Full OpenAPI component schemas: [OPENAPI.yaml](./OPENAPI.yaml) `#/components/schemas`.
