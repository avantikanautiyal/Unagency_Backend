# M4.6 SDK Platform — ACP Report

No **blocking** issues were found. The SDK platform is implemented within all
milestone rules (interfaces, DI, immutable contracts, builder, `Result<T>`, no
SDK packages, no networking, no adapters, no frozen-module edits).

The following **non-blocking** Architecture Change Proposals are recorded.

---

## ACP-S1 — Canonical request bridge type (LOW)

- **Problem:** `SdkRequest` and `CanonicalProviderRequest` (Transport M4.5) carry
  overlapping fields. Future wrappers must manually map between them.
- **Impact:** Minor duplication when bridging SDK → Transport.
- **Proposed solution:** Add a shared `toCanonicalProviderRequest(sdk: SdkRequest)`
  builder in a future additive utility (either `sdk/requests` or `shared/providers`).
- **Affected modules:** `sdk/requests`, `transport/builders` (additive only).
- **Migration:** Purely additive helper; no contract change.
- **Priority:** Low.

## ACP-S2 — Unified error taxonomy across SDK / Transport / Adapter (LOW)

- **Problem:** `SdkError.kind`, `TransportError.kind`, and `ProviderError.kind`
  (adapter) are mapped independently in each engine.
- **Impact:** Possible drift in error classification across provider layers.
- **Proposed solution:** Introduce a shared canonical provider-error mapping in
  `shared/errors` consumed by all three engines.
- **Affected modules:** `shared/errors`, `sdk`, `transport`, `adapters`.
- **Migration:** Additive utility; adopt incrementally.
- **Priority:** Low.

## ACP-S3 — Transport contract import for future bridge (INFORMATIONAL)

- **Problem:** M4.6 depends on adapter contracts but not yet on transport contracts,
  even though the architecture diagram shows SDK → Transport.
- **Impact:** None today; wrappers are placeholders. Future wrappers will need
  the transport engine interface.
- **Proposed solution:** When the first real wrapper is implemented, inject
  `IProviderTransportEngine` via constructor without changing public SDK contracts.
- **Affected modules:** `sdk/common/abstract-sdk-client`, vendor wrappers.
- **Migration:** Constructor injection only; no breaking change.
- **Priority:** Informational.

---

**Recommendation:** Proceed. The Provider SDK Platform (M4.6) is ready to be frozen.
Future provider integration changes only the corresponding `*SdkWrapper` class while
the rest of the Intelligence Operating System remains unchanged.
