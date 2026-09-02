# Provider Identity & Trust Platform (M4.2)

> Owns every provider credential. Responsible for **identity** and **trust**.
> **Not** responsible for execution, provider SDKs, or networking.

The Provider Runtime (M4.1) requests a **credential session** through
`IProviderIdentityEngine` and receives **only a validated, secret-free
`CredentialSession`**. It never learns where credentials are stored, how
authentication works, or which provider is used.

```
Provider Identity → Credential Resolution → Authorization → Trust Validation
  → Credential Session → Provider Runtime
```

## Module layout

```
identity/
├── engine/          ProviderIdentityEngine (facade / orchestrator)
├── credentials/     InMemoryCredentialStore (register/resolve/revoke/rotate/list)
├── vault/           InMemorySecretProvider (placeholder — no real vault)
├── authentication/  ProviderAuthenticationEngine (no networking / OAuth flow)
├── authorization/   ProviderAuthorizationEngine (capability/tenant/scope/perm)
├── trust/           ProviderTrustEngine (+ attestation hook)
├── permissions/     permission helpers
├── tenancy/         tenancy ordering + scope containment
├── rotation/        RotationEngine (rotation logic only)
├── validation/      CredentialValidator (7 dimensions)
├── sessions/        InMemoryCredentialSessionManager
├── policies/        default policies + region evaluation
├── masking/         CredentialMasker (secrets never logged)
├── auditing/        InMemoryAuditCredentialLogger + event publishers
├── builders/        immutable input/request builders
├── contracts/       immutable public contracts + enums
├── interfaces/       ports (DI)
├── factories/       createIdentityPlatform()
├── testing/         deterministic fixtures
└── docs/            reports, models, diagrams
```

## Quick start

```ts
import {
  createIdentityPlatform,
  RegisterCredentialInputBuilder,
  CreateCredentialSessionRequestBuilder,
} from "./";

const { engine, store } = createIdentityPlatform();

await store.registerCredential(
  new RegisterCredentialInputBuilder()
    .withProvider(providerId)
    .withScheme("api_key")
    .withSecret(rawSecret)          // consumed by the vault, never retained
    .withOrganization(orgId)
    .withWorkspace(workspaceId)
    .withTrustLevel("high")
    .withPermissions(["read", "execute"])
    .build()
);

const session = await engine.createCredentialSession(
  new CreateCredentialSessionRequestBuilder()
    .withProvider(providerId)
    .withOrganization(orgId)
    .withWorkspace(workspaceId)
    .withRequiredPermissions(["read", "execute"])
    .build()
);
// session.ok === true → hand session.value to the Provider Runtime. No secret inside.
```

## Guarantees

- **Secret isolation** — raw secrets live only behind `ISecretProvider`. No
  contract, snapshot, audit event, log, or error contains a raw secret.
- **Provider independence** — no vendor SDKs, no HTTP, no OAuth flow.
- **Result pattern** — expected failures return `Result<T>`; no control-flow throws.
- **Immutable contracts** — every public contract is `readonly`.
- **Constructor injection** — every engine takes its collaborators via the constructor.

See `docs/` for the Architecture Review, Implementation Report, Future
Extension Report, Trust/Authorization/Rotation/Session models, diagrams,
dependency graph, unit-test summary, and ACPs.
