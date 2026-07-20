# Route Map

Source of truth: `src/platform/api/routes/route-map.ts` (`API_ROUTE_MAP`).

- Every domain path is registered for **both** `/v1` and `/v2`.
- Matching via `matchRoute(method, path)` with `:param` segments.
- Auth-required flag + RBAC permission list per route.

Use `createEnterpriseApiPlatform().gateway.listRoutes()` for runtime enumeration.
