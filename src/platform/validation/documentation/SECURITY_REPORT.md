# SECURITY REPORT

Generated: 2026-08-01T16:16:01.384Z

**Passed:** 14/14

| Check | Passed | Message |
| --- | --- | --- |
| jwt_auth | true | JWT issued on login |
| rbac | true | Authenticated catalog access granted |
| tenant_isolation | true | Demo tenant organization matches seed |
| workspace_isolation | true | Workspace scoped to tenant seed |
| brand_isolation | true | Brand Brain scoped by organizationId |
| knowledge_isolation | true | Knowledge graph scoped by organizationId |
| secret_leakage | true | No secret patterns detected |
| execution_leakage | true | Audit trail sanitized |
| prompt_leakage | true | Prompt not exposed |
| prompt_sanitization | true | Explainability payloads sanitized |
| cross_tenant_access | true | Unauthenticated request rejected |
| api_keys | true | API keys not exposed in responses |
| rate_limiting | true | Rate limit path reachable |
| upload_validation | true | Upload validation enforced at gateway boundary |
