# Unit Tests

**Suite:** `tests/platform/api/enterprise-api-gateway.test.ts`

| Area | Coverage |
|------|----------|
| Versioning | `/v1` + `/v2` route contracts |
| Authentication | JWT login, missing auth 401, API keys |
| RBAC | Role permission matrix |
| Tenant isolation | Cross-org execution 403 |
| Execution | Create + artifacts/diagnostics/trace/cost/eval/experience |
| Streaming | SSE frames; websocket abstraction |
| Rate limits | Per-user window denial |
| Validation | Path/version mismatch |
| Health | Public only-entry-point flag |

**Result:** 11 tests passed.
