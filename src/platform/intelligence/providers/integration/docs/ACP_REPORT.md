# M4.7 Integration Platform — ACP Report

No **blocking** issues. Three **non-blocking** ACPs:

---

## ACP-I1 — SDK/Adapter registry linkage on install (LOW)

- **Problem:** Install does not yet verify SDK wrapper or adapter registration.
- **Proposed solution:** Optional install-time checks against `ISdkRegistry` and
  `IProviderAdapterRegistry`; warnings only.
- **Priority:** Low.

## ACP-I2 — Negotiation capability matrix sync (LOW)

- **Problem:** Sync updates registry inventories but does not diff against
  negotiation compatibility matrices.
- **Proposed solution:** Add optional `INegotiationCompatibilitySync` hook in sync engine.
- **Priority:** Low.

## ACP-I3 — Persisted integration registry (INFORMATIONAL)

- **Problem:** In-memory registry loses state on restart.
- **Proposed solution:** Storage-backed `IProviderIntegrationRegistry` in a future milestone.
- **Priority:** Informational.

---

**Recommendation:** Proceed. M4.7 is ready to freeze.
