# M4.2 — Architecture Change Proposals (ACPs)

No **blocking** ACPs. The module is self-contained, provider-independent, and
does not require any change to frozen modules to function or be tested.

The following **non-blocking** proposals capture integration work for later
milestones. None of them modify a frozen contract today.

---

## ACP-I1 — Wire Provider Runtime to the Identity Engine

- **Problem** — M4.1 Provider Runtime currently dispatches without acquiring a
  credential session. The success criterion is satisfied at the identity module
  boundary, but the two modules are not yet connected.
- **Impact** — Until wired, the Runtime has no credentials; end-to-end provider
  execution is not possible.
- **Proposed solution** — In a dedicated integration milestone, have the Runtime
  (or the future provider adapter layer) call
  `IProviderIdentityEngine.createCredentialSession()` before dispatch and pass the
  secret-free `CredentialSession` to the adapter. The adapter redeems the secret
  against `ISecretProvider`.
- **Affected modules** — `providers/runtime` (frozen), `providers/identity`,
  future `providers/adapters`.
- **Migration strategy** — Additive: introduce an adapter/bridge; do not change
  the runtime's public `IProviderRuntime` contract.
- **Priority** — High (required for M4 completion), but out of scope for M4.2.

---

## ACP-I2 — Shared `CredentialId` in the shared identifiers module

- **Problem** — `CredentialId` is currently defined locally in
  `providers/identity/contracts/identifiers.ts` because `shared/identifiers`
  (frozen) has no `CredentialId`.
- **Impact** — Minor duplication of the branding pattern; no functional issue.
- **Proposed solution** — Add `CredentialId` + `asCredentialId` to
  `shared/identifiers` and re-export from the identity module for backward
  compatibility.
- **Affected modules** — `shared` (frozen), `providers/identity`.
- **Migration strategy** — Add to shared; alias the local type to the shared one.
- **Priority** — Low.

---

## ACP-I3 — Credential audit events as first-class platform audit records

- **Problem** — Credential audit events are recorded in an in-memory logger and
  optionally published on the event bus, but are not yet persisted to the
  platform's governance audit sink.
- **Impact** — Audit history is process-local until a durable sink exists.
- **Proposed solution** — In M9 Enterprise Governance, bridge
  `ICredentialEventPublisher` output into the governance audit store.
- **Affected modules** — `providers/identity`, future `governance`.
- **Migration strategy** — Additive subscriber; no producer changes.
- **Priority** — Medium (aligns with M9).
