# Multi-Tenant Model

## Hierarchy

```
Organization
 ├─ Departments
 ├─ Teams
 ├─ Workspaces
 │   └─ Projects
 └─ Users (membership + roles)
```

## Isolation

`TenantContext` required for execution/history/domain reads.
`ensureTenant` verifies organization existence and workspace membership.
Cross-org execution access returns **403**.

## Platform seed

Factory optionally seeds demo org + owner (`admin@unagency.local`) for local/tests.
