# Authentication Model

## Schemes

| Scheme | Header | Notes |
|--------|--------|-------|
| JWT | `Authorization: Bearer jwt_…` | Default login |
| OAuth | `Authorization: Bearer oauth_…` | Abstraction (token store) |
| Session | `Authorization: Bearer session_…` | Multi-device sessions |
| Service account | `Authorization: Bearer service_…` | Machine credentials |
| API key | `x-api-key: uag_…` | Org-scoped keys |

## Session

`AuthSession`: sessionId, userId, organizationId, deviceId, scheme, expiry, revoked.
Multiple devices = multiple sessions per user.

## RBAC

Roles: `owner` · `admin` · `member` · `viewer` · `billing` · `service`  
Mapped in `authorization/rbac.ts`. `owner` grants `admin:*`.
