# API Inventory & Documentation

Complete inventory of **existing** UNAGENCY HTTP and Gateway APIs.

> No backend redesign. No new endpoints implemented in this milestone.  
> Gaps → [MISSING_API_REPORT.md](./MISSING_API_REPORT.md)

## Documents

| File | Purpose |
|------|---------|
| [MASTER_API_REFERENCE.md](./MASTER_API_REFERENCE.md) | Every exposed endpoint (Gateway + Legacy) |
| [ROUTE_MAP.md](./ROUTE_MAP.md) | Path → source file map |
| [OPENAPI.yaml](./OPENAPI.yaml) | OpenAPI **3.1** (Enterprise Gateway) |
| [OPENAPI.json](./OPENAPI.json) | Same spec as JSON |
| [POSTMAN_COLLECTION.json](./POSTMAN_COLLECTION.json) | Gateway + Legacy folders |
| [INSOMNIA_COLLECTION.json](./INSOMNIA_COLLECTION.json) | Gateway requests |
| [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md) | RN / Web integration |
| [AUTHENTICATION_GUIDE.md](./AUTHENTICATION_GUIDE.md) | Auth for both surfaces |
| [VERSIONING_GUIDE.md](./VERSIONING_GUIDE.md) | `/v1` vs `/v2` + legacy |
| [ERROR_CODES.md](./ERROR_CODES.md) | Error envelope & codes |
| [SDK_GENERATION_GUIDE.md](./SDK_GENERATION_GUIDE.md) | Client codegen |
| [MISSING_API_REPORT.md](./MISSING_API_REPORT.md) | Not implemented — wishlist gaps |
| [REQUEST_RESPONSE_MODELS.md](./REQUEST_RESPONSE_MODELS.md) | Key schemas |

## Regenerate machine artifacts

```bash
node api/docs/_generate-artifacts.mjs
```

## Counts (inventory)

| Surface | Routes |
|---------|--------|
| Enterprise Gateway per version | 47 |
| Enterprise Gateway v1+v2 | 94 |
| Legacy Express (mounted) | ~100+ |

Sources: `src/platform/api/routes/route-map.ts`, `src/app.ts`, `src/routes/*`.
