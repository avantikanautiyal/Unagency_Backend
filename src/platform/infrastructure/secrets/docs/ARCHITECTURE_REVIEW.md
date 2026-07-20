# Secret Management — Architecture Review

## Verdict

New enterprise infrastructure module under `src/platform/infrastructure/secrets/`.
Not part of the Intelligence OS. Additive Identity integration via existing
`createIdentityPlatform({ secretProvider })` — no Identity redesign.

## Design

```
Callers / Identity Adapter
        ↓
   ISecretManager (public API)
        ↓
  Encryptor + Cache + Auditor + Lifecycle
        ↓
   ISecretBackend (local | env | cloud placeholders)
```

## Constraints honored

| Constraint | How |
|------------|-----|
| No Intelligence OS edits | Import-only / Identity inject |
| No cloud SDKs | Placeholders only |
| No raw secret leakage on public get | ProtectedSecretValue + lease reveal |
| Config-only provider switch | `providerKind` on factory |
| Redis later | `ISecretCache` abstraction |

## Non-goals

Redis, queues, Kubernetes deployment, cloud networking.
