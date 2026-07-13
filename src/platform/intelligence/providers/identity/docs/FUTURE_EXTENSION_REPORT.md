# M4.2 — Future Extension Report

Every future capability plugs in through an existing port or an injected hook.
No public contract or engine needs to change.

## 1. Real secret managers (`ISecretProvider`)

`InMemorySecretProvider` is one implementation of `ISecretProvider`. Future
backends implement the same port and are injected via
`createIdentityPlatform({ secretProvider })`:

- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager
- Kubernetes Secrets
- Environment Variables

`kind: SecretProviderKind` already enumerates these. No change to the store,
engine, or contracts — the `secretRef` handle is backend-agnostic.

## 2. Real authentication (`IProviderAuthenticationEngine`)

Today's engine performs structural checks only. Real OAuth2/JWT/client-credentials
verification belongs inside **provider adapters** (later milestones) or a
replacement authentication engine. The `ProviderAuthenticationResult` contract is
already shaped for it (`authenticated`, `reasons`).

## 3. Attestation & advanced trust (`IProviderAttestationVerifier`)

`ProviderTrustEngine` accepts an optional attestation verifier. Hardware/remote
attestation, TPM checks, or SLSA-style provenance verification inject here without
touching the trust pipeline.

## 4. RBAC / ABAC (M9 Governance)

`IProviderAuthorizationEngine` can be replaced by a policy-driven engine
(role/attribute based) while keeping `ProviderAuthorization` as the output
contract. Permissions and tenancy levels are already modeled.

## 5. Durable stores

`ICredentialStore` and `ICredentialSessionManager` are ports. Mongo/Redis-backed
implementations plug in via the factory; secrets still live behind
`ISecretProvider`, so durable metadata never holds secret material.

## 6. Delegation & service accounts

`ProviderScope` includes an `attributes` bag and the tenancy model reserves
service accounts. Delegation (`delegate` permission) is already defined; a future
`DelegationEngine` can consume it without contract changes.

## 7. Events & telemetry

`ICredentialEventPublisher` already bridges credential audit events onto the
platform `IEventBus` via `EventBusCredentialEventPublisher`. A telemetry sink can
subscribe to `credential_*` event types with no producer changes.

## 8. Runtime integration

The Provider Runtime will call `IProviderIdentityEngine.createCredentialSession()`
before dispatch and pass the resulting session to the (future) provider adapter,
which redeems the secret directly against `ISecretProvider`. This wiring is
tracked as **ACP-I1** to avoid modifying frozen M4.1 contracts now.
