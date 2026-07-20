# Integration Tests

Gateway integration with platform services (no frontend):

| Flow | Status |
|------|--------|
| Login → Bearer → Capabilities | Covered |
| Login → API key → Provider catalog | Covered |
| Login → Create execution → Distributed Execution tick | Covered |
| Login → Stream SSE | Covered |
| Tenant isolation across orgs | Covered |

Optional heavier path: `createEnterpriseApiPlatform({ useIntegrationLayer: true })`
pipes jobs into Intelligence OS Integration Layer without exposing it to clients.
