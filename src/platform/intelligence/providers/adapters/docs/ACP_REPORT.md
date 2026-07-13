# M4.4 — Architecture Change Proposals (ACP Report)

All ACPs below are **non-blocking**. The Provider Adapter Platform is complete and
certified for M4.5 without them. No frozen module was modified; these document
improvements for future milestones.

---

## ACP-A1 — Enrich the runtime `ProviderExecutionResponse`

- **Problem:** The frozen M4.1 `ProviderExecutionResponse` holds only
  `output`, `usage`, `providerRequestId`, `streamed`, `finishedAt`. The canonical
  `ProviderAdapterResponse` also carries `finishReason`, `safety`, `reasoning`,
  `latencyMs`, and `warnings`. The `DefaultResponseTranslator` therefore reports
  these as `droppedFields` because it cannot mutate a frozen contract.
- **Impact:** Downstream consumers reading the runtime response (not the richer
  adapter response) lose finish reason / safety / latency signal.
- **Proposed solution:** Add optional fields (`finishReason?`, `latencyMs?`,
  `safety?`, `warnings?`) to `ProviderExecutionResponse`, or expose the
  `ProviderAdapterResponse` directly through the runtime result.
- **Affected modules:** `providers/runtime` (contract), `providers/adapters`
  (response translator).
- **Migration:** Purely additive optional fields — backward compatible.
- **Priority:** Medium.

---

## ACP-A2 — Consolidate the M1 adapter stub with the M4.4 platform

- **Problem:** M1 placed a minimal `IProviderAdapter` (with `execute()`) +
  `PlaceholderProviderAdapter` directly in `providers/adapters/`, consumed by the
  frozen `providers/factory` and `providers/interfaces`. M4.4 defines a richer
  `IProviderAdapter` (and `ProviderAdapterRequest`/`ProviderAdapterResponse`/
  `AbstractProviderAdapter`) with the same names, so the M4.4 surface is exported
  from `adapters/adapter-platform.ts` rather than `adapters/index.ts` to avoid
  colliding with the frozen M1 barrel.
- **Impact:** Two same-named contracts coexist; consumers must import the M4.4
  platform from `adapter-platform`, which is slightly non-obvious.
- **Proposed solution:** In a future (un-freezing) milestone, retire the M1
  placeholder adapter, point `providers/factory` at the M4.4 registry/engine, and
  make `adapters/index.ts` the single M4.4 entry.
- **Affected modules:** `providers/adapters` (M1 stub), `providers/factory`,
  `providers/interfaces`.
- **Migration:** Replace `PlaceholderProviderAdapter` construction in the factory
  with adapter-registry resolution; re-point the `IProviderAdapter` re-export.
- **Priority:** Low (cosmetic / ergonomics; no functional gap today).

---

## ACP-A3 — Manifest schema registry & versioned compatibility

- **Problem:** Manifests are validated structurally but there is no central
  schema/version registry to detect breaking manifest-version changes over time.
- **Impact:** A provider upgrading its manifest could silently change compatible
  features without a compatibility diff.
- **Proposed solution:** Add a manifest version registry that stores previous
  `ProviderManifestVersion`s and produces a compatibility diff on update.
- **Affected modules:** `providers/adapters/manifests` (additive).
- **Migration:** Additive; opt-in.
- **Priority:** Low.

---

**ACP count:** 3 (0 blocking).
**Freeze recommendation:** M4.4 Provider Adapter Platform is ready to freeze and
proceed to **M4.5 Concrete Providers**.
