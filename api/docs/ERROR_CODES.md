# Error Codes Reference

## Enterprise API Gateway

Envelope (`ApiErrorBody`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {}
  }
}
```

| HTTP | Typical code | When |
|------|--------------|------|
| 400 | `VALIDATION_ERROR` | Missing/invalid body or params |
| 401 | `UNAUTHORIZED` | Missing/invalid Bearer or API key |
| 403 | `FORBIDDEN` | RBAC permission missing or tenant isolation denial |
| 404 | `NOT_FOUND` | Unknown route or resource id |
| 409 | `CONFLICT` | State conflict (when raised by services) |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unhandled server failure |
| 503 | `UNAVAILABLE` | Dependency unavailable (when mapped) |

Codes map from platform `IntelligenceError` / validation / auth services in:

- `src/platform/api/middleware/pipeline.ts`
- `src/platform/api/serialization/serialize.ts`
- `src/platform/intelligence/shared/errors`

Clients should branch on **HTTP status** first, then `error.code`.

## Legacy Express

Legacy handlers commonly return application-specific JSON with HTTP status via Express error middleware:

- `src/middlewares/errorHandler.middleware.ts`
- `src/middlewares/routeErrorHandler.middleware.ts`

Treat legacy error bodies as handler-specific; do not assume Gateway `error.code` shape on `/auth`, `/projects`, etc.

## Streaming errors

`GET /v1/executions/{id}/stream` failures use the standard Gateway error envelope (not a half-open SSE socket). Success returns SSE-shaped frames inside `data`.
