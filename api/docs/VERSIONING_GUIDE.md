# Versioning Guide

## Enterprise API Gateway

| Version | Base path | Status |
|---------|-----------|--------|
| v1 | `/v1` | Current |
| v2 | `/v2` | Mirror of v1 (forward-compatible paths) |

Rules:

1. Every Gateway route exists under both versions with the same relative path.
2. Response includes `version` on the `ApiResponse` envelope (`src/platform/api/contracts/http.ts`).
3. Clients should pin a major version (`/v1` or `/v2`) and not omit the version segment.
4. Deprecations (when introduced) will set `deprecated: true` on `RouteDefinition` — none are deprecated today.

Source: `src/platform/api/versioning/versions.ts`, `routes/route-map.ts`.

## Legacy Express

Legacy SaaS routes are **unversioned** path mounts (`/auth`, `/projects`, …). They are a separate surface from `/v1`/`/v2`.

## Compatibility expectation for frontends

Prefer Enterprise Gateway `/v1` for Intelligence / executions / catalogs.  
Use Legacy Express for current SaaS product flows until those domains are consolidated behind the Gateway (not part of this inventory milestone).
