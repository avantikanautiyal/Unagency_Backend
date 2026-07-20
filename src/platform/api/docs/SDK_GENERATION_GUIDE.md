# SDK Generation Guide

The API is designed for codegen targeting:

TypeScript · Flutter/Dart · Swift · Kotlin · Python · Go · Java

## Rules for generators

1. Use OpenAPI (`docs/OPENAPI_SPECIFICATION.md`) + `API_ROUTE_MAP` as inputs.
2. Always send `x-api-version` matching path prefix (`/v1` or `/v2`).
3. Auth: Bearer token **or** `x-api-key`.
4. Parse envelopes `{ data, meta }` / `{ error }` — never assume OS internal shapes.
5. Streaming: consume SSE frame arrays; map to platform EventSource/WebSocket adapters in SDK only.
6. IDs are opaque strings — do not parse provider model names.
7. Do not expose Runtime/Routing/Provider client packages inside SDKs.

## Suggested package names

`@unagency/sdk`, `unagency_flutter`, `UnagencyKit`, etc. (future milestone).
