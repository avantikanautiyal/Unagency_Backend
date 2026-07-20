# Authentication Guide

## Two auth systems (do not conflate)

| System | Used by | Tokens |
|--------|---------|--------|
| **Enterprise API Gateway** | `/v1`, `/v2` platform routes | Bearer access token **or** `x-api-key` |
| **Legacy Express SaaS** | `/auth`, `/users`, `/projects`, … | Firebase / session verified by `VerifyUserHandler` |

Frontends must pick the correct surface for each call.

---

## Enterprise Gateway authentication

### Login

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret",
  "organizationId": "org_…",
  "deviceId": "device_…",
  "scheme": "jwt"
}
```

`scheme`: `jwt` | `oauth` | `session`

**Response (`IssuedToken`):**

```json
{
  "data": {
    "accessToken": "…",
    "refreshToken": "…",
    "tokenType": "Bearer",
    "expiresInSec": 3600,
    "scheme": "jwt",
    "sessionId": "…"
  }
}
```

### Calling protected routes

```http
Authorization: Bearer <accessToken>
```

or

```http
x-api-key: <apiKey>
```

### Issue API key

```http
POST /v1/auth/api-keys
Authorization: Bearer <adminToken>
```

Requires permission `admin:*`.

### Principal & tenant isolation

Gateway pipeline attaches `AuthPrincipal` with `organizationId`, optional `workspaceId`, `roles`.

Authorization checks route `permissions` (RBAC). Tenant service enforces organization/workspace isolation before controllers run.

**Public (no auth):**

- `GET /{v}/health`
- `POST /{v}/auth/login`

---

## Legacy Express authentication

### Register / login style flows

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/register` | Register |
| `POST /auth/register-login` | Register or login |
| `GET /auth/verify` | Verify authenticated user (`RegisterIfNot` + verify) |
| `POST /auth/logout` | Logout (authenticated) |
| `POST /auth/forget-password` | Forgot password |
| `POST /auth/send-email-verification` | Send verification email |
| `GET /auth/verify-email` | Verify email link |
| `POST /auth/register-fcm` | Register FCM device token |

### Roles (legacy)

Common role gates: `admin`, `superadmin`, `customer`, `servicing`, `resource`.

Middleware: `VerifyUserHandler`, `VerifyRole([...])`, sometimes `IsVerifiedUser`.

---

## What is NOT exposed as Gateway auth today

| Capability | Status |
|------------|--------|
| Dedicated refresh-token route | Not in `route-map.ts` (token may include `refreshToken` on login) |
| Dedicated logout / revoke session Gateway route | Not in map |
| Forgot / reset password on Gateway | Legacy `/auth/*` only |
| OAuth redirect dance endpoints | Scheme abstraction on login only |
| Service account CRUD REST | API keys cover service principals |

Listed in [MISSING_API_REPORT.md](./MISSING_API_REPORT.md) where frontend needs them on Gateway.
