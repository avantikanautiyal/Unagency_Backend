# Dependency Graph

```
EnterpriseApiPlatform
 └─ ApiGatewayEngine
     ├─ Authentication (JWT / OAuth / API key / session / service)
     ├─ Authorization (RBAC)
     ├─ TenantService (org / workspace / user isolation)
     ├─ RateLimitService (org / workspace / user / key / capability / provider)
     ├─ StreamingService (SSE / WS / chunked)
     ├─ CatalogApiService → Official Provider Catalog seed (public)
     └─ ExecutionApiService
          ├─ Distributed Execution (enqueue / tick / cancel)
          └─ Integration Layer (optional full OS run)
```

**Forbidden:** frontend → Runtime / Routing / Negotiation / Providers.

Intelligence OS modules remain untouched callees via public factories only.
