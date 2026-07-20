# SDK Generation Guide

## Input

Use the inventory OpenAPI document:

```
api/docs/OPENAPI.yaml
```

(also `OPENAPI.json`)

This describes the **Enterprise API Gateway** (`/v1` and `/v2` servers).

Legacy Express SaaS is inventoried in Postman (`POSTMAN_COLLECTION.json` → Legacy folder) but is **not** fully modeled in OpenAPI (separate, evolving SaaS surface).

## Recommended generators

### TypeScript / JavaScript (frontend)

```bash
npx @openapitools/openapi-generator-cli generate \
  -i api/docs/OPENAPI.yaml \
  -g typescript-fetch \
  -o packages/unagency-api-client \
  --additional-properties=supportsES6=true,typescriptThreePlus=true
```

Or:

```bash
npx openapi-typescript api/docs/OPENAPI.yaml -o src/api/schema.d.ts
```

### Swift (iOS) / Kotlin (Android)

```bash
openapi-generator-cli generate -i api/docs/OPENAPI.yaml -g swift5 -o sdk/swift
openapi-generator-cli generate -i api/docs/OPENAPI.yaml -g kotlin -o sdk/kotlin
```

## Configuration tips

1. Set server URL to include version (`…/v1`) or use OpenAPI `servers` entries.
2. Configure security:
   - `bearerAuth` → `Authorization` header
   - `apiKeyAuth` → `x-api-key`
3. Treat `x-permissions` extensions as documentation for RBAC (not enforced client-side).
4. Streaming: generate a normal GET client for `/executions/{executionId}/stream` and parse SSE frames from **JSON `data`**, not EventSource, unless a future native SSE transport is mounted.

## Regenerating inventory artifacts

```bash
node api/docs/_generate-artifacts.mjs
python3 -c "import json,yaml,pathlib; p=pathlib.Path('api/docs'); data=json.loads((p/'OPENAPI.json').read_text()); (p/'OPENAPI.yaml').write_text(yaml.dump(data, sort_keys=False))"
```

Do **not** hand-edit route lists without updating `src/platform/api/routes/route-map.ts` (Gateway) or Express routers (Legacy).
