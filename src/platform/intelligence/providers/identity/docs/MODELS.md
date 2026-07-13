# M4.2 — Models & Diagrams

Deliverables 4–9: Identity Architecture Diagram, Credential Lifecycle Diagram,
Trust Model, Authorization Model, Credential Rotation Model, Session Model.
(The identity architecture diagram + dependency graph also appear in the
Architecture Review.)

---

## Credential lifecycle diagram

```mermaid
stateDiagram-v2
  [*] --> active: registerCredential()
  active --> rotating: rotateCredential() begins
  rotating --> active: rotation completes
  active --> active: rotate (new secretRef)
  active --> revoked: revokeCredential()
  active --> expired: expiresAt reached
  revoked --> [*]
  expired --> active: rotate (rotateOnExpiry)
```

- `registerCredential()` mints a `CredentialId` + `secretRef`, stores the raw
  secret in `ISecretProvider`, and keeps only metadata + reference in the store.
- `rotateCredential()` writes new material under a **new** `secretRef`, updates
  `rotatedAt` / `lastRotationReason`, and best-effort deletes the old material.
- Revoked credentials are never returned by `selectCredential` (status filter).

---

## Trust model

Trust levels are ordered (least → most trusted):

```
untrusted < low < standard < high < verified
```

`IProviderTrustEngine.evaluate()` returns a `TrustEvaluation` that must pass all
checks:

| Check (dimension) | Rule |
|-------------------|------|
| trust | `credential.trustLevel >= minTrustLevel` (default `standard`) |
| identity (status) | credential status is `active` |
| identity (provider) | credential provider matches the request |
| region | request region satisfies `ProviderRegionConstraint` |
| policy (attestation) | optional `IProviderAttestationVerifier` returns verified |

`untrusted` credentials always fail. Attestation is an **injected hook** — future
hardware/remote attestation plugs in without modifying the engine.

```mermaid
flowchart LR
  C[Credential] --> T{trustLevel >= min?}
  T -->|no| X[untrusted]
  T -->|yes| S{status active?}
  S -->|no| X
  S -->|yes| P{provider match?}
  P -->|no| X
  P -->|yes| R{region allowed?}
  R -->|no| X
  R -->|yes| A{attestation ok?}
  A -->|no| X
  A -->|yes| OK[trusted]
```

---

## Authorization model

`IProviderAuthorizationEngine.authorize()` evaluates, in order:

1. **Provider check** — credential provider == requested provider.
2. **Status check** — credential is `active`.
3. **Tenant/scope check** — credential scope *covers* the request. A scope field
   that is absent acts as a wildcard; a present field must match
   (organization, workspace, project, user, provider, capability).
4. **Permission check** — every required permission is present on the credential.

Permissions: `read`, `execute`, `manage`, `rotate`, `delete`, `delegate`, `audit`.
Granted permissions = the intersection of requested and held permissions (or all
held permissions when none are explicitly requested).

Tenancy levels: `platform`, `organization`, `workspace`, `project`, `user`
(service accounts reserved for the future).

```mermaid
flowchart TD
  R[Request + Credential] --> P1[provider match]
  P1 --> P2[status active]
  P2 --> P3[scope covers request]
  P3 --> P4[required perms subset of held]
  P4 -->|all pass| G[authorized + granted perms]
  P1 & P2 & P3 & P4 -->|any fail| D[denied + reasons]
```

---

## Credential rotation model

`IRotationEngine` performs **rotation logic only** (no secret-manager calls).

Reasons/strategies: `scheduled`, `manual`, `forced`, `expired`, `revoked`.

`shouldRotate(credential, nowMs)`:

- `false` if no policy or `enabled === false`.
- `true` if `rotateOnExpiry` and `expiresAt <= now`.
- `true` if age since `rotatedAt|createdAt` `>= maxAgeMs` or `>= intervalMs`.

`rotate(id, reason, newSecret?)`:

- resolves the credential (refuses to rotate an already-revoked credential when
  `reason === "revoked"`),
- generates a synthetic secret when the caller supplies none (placeholder — a
  real secret manager would mint the material),
- delegates to `store.rotateCredential()` which swaps `secretRef`,
- returns `{ previousSecretRef, newSecretRef, reason, rotatedAt }`.

```mermaid
sequenceDiagram
  participant Caller
  participant ROT as RotationEngine
  participant STORE as CredentialStore
  participant VAULT as ISecretProvider
  Caller->>ROT: rotate(id, reason, newSecret?)
  ROT->>STORE: resolveCredential(id)
  ROT->>STORE: rotateCredential(id, {reason, newSecret})
  STORE->>VAULT: putSecret(newRef, material)
  STORE->>VAULT: deleteSecret(oldRef)
  STORE-->>ROT: updated credential
  ROT-->>Caller: CredentialRotationResult
```

---

## Session model

`ICredentialSessionManager` owns in-memory, secret-free sessions.

Session states: `active`, `renewed`, `expired`, `released`, `invalidated`.

Operations: `acquire`, `get`, `renew`, `release`, `expire`, `invalidate`.

Each session carries a `CredentialLease` (`leaseId`, `sessionId`, `credentialId`,
`acquiredAt`, `expiresAt`) plus the authentication/authorization/validation
outputs and the `CredentialReference` — **never a raw secret**.

```mermaid
stateDiagram-v2
  [*] --> active: acquire()
  active --> renewed: renew()
  renewed --> renewed: renew()
  active --> expired: expire()
  active --> released: release()
  active --> invalidated: invalidate()
  renewed --> released: release()
  renewed --> invalidated: invalidate()
  released --> [*]
  invalidated --> [*]
  note right of renewed: renew refused after release/invalidate
```
