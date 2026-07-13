# M4.3 — Architecture Change Proposals (ACPs)

No blocking issues were found. The negotiation platform was implemented against
frozen module contracts **without modifying any frozen module**. The following
are **non-blocking** proposals for future consideration.

---

## ACP-N1 — First-class model capability contract

- **Priority:** Medium
- **Problem:** `IProviderCapabilityMatrix.ProviderFeatureSupport` exposes only 9
  feature booleans + `maxContextTokens` + free-form `attributes`. Negotiation
  must infer reasoning / structured-output / JSON-mode / tool-use from
  `attributes` keys, which is stringly-typed and provider-conventions-dependent.
- **Impact:** Model negotiation accuracy depends on ad-hoc attribute keys;
  different provider adapters could disagree on key names.
- **Proposed solution:** Introduce an optional, additive `ProviderModelProfile`
  (per model) or extend `ProviderCapabilityProfile.attributes` with a typed,
  documented `ModelCapabilityHints` sub-contract in the capability-matrix module.
- **Affected modules:** `providers/capability-matrix` (additive only).
- **Migration:** Fully backward compatible; `deriveModelCompatibility()` prefers
  the typed field when present and falls back to attributes otherwise.

---

## ACP-N2 — Shared policy-consultation port in `policies`

- **Priority:** Low
- **Problem:** Negotiation defines its own `IPolicyProvider` seam because no
  platform-wide policy-consultation interface exists yet.
- **Impact:** When M9 Governance lands, multiple modules may define parallel
  policy ports.
- **Proposed solution:** Promote a shared `IPolicyConsultation` port into a
  platform `policies` module; negotiation adopts it via adapter.
- **Affected modules:** future `policies` module; `providers/negotiation`
  (adapter only).
- **Migration:** `DefaultPolicyProvider` becomes an adapter over the shared port.

---

## ACP-N3 — Optional non-mutating identity validation method

- **Priority:** Low
- **Problem:** To validate authorization/trust, `IdentityNegotiator` currently
  calls `createCredentialSession()` and immediately `releaseSession()`. This is
  correct and secret-free, but it acquires/releases a session purely to validate.
- **Impact:** Minor churn on the session manager during negotiation.
- **Proposed solution:** Add an additive `validateAuthorization(request):
  Result<IdentityAuthorizationView>` to `IProviderIdentityEngine` that performs
  the identity/authorization/trust checks without minting a session.
- **Affected modules:** `providers/identity` (additive interface method).
- **Migration:** `IdentityNegotiator` prefers the new method when available;
  otherwise keeps the create+release path. No breaking change.

---

### Summary

| ACP | Priority | Blocking? |
| --- | --- | --- |
| ACP-N1 | Medium | No |
| ACP-N2 | Low | No |
| ACP-N3 | Low | No |

**Architecture freeze recommendation:** M4.3 is ready to freeze. All three ACPs
are additive, backward-compatible enhancements for later milestones.
