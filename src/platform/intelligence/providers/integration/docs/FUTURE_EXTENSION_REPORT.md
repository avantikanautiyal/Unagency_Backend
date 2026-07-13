# M4.7 Integration Platform — Future Extension Report

## 1. Adding a new provider (4 steps)

1. Create `ProviderManifest` (M4.4 builder)
2. Implement `*SdkWrapper` (M4.6)
3. Implement `*ProviderAdapter` (M4.4)
4. Call `engine.integrate({ action: "register", manifest })` then `install` + `activate`

No other platform module changes.

## 2. Persistence

Replace `InMemoryIntegrationRegistry` with a storage-backed implementation of
`IProviderIntegrationRegistry`. Contracts unchanged.

## 3. Negotiation catalog sync

Extend `DefaultSynchronizationEngine` to diff manifest capabilities against the
Capability Catalog / Negotiation matrices — additive only.

## 4. SDK registry linkage

On `install`, optionally verify that `ISdkRegistry` has a wrapper for the
manifest vendor. Report via diagnostics, not blocking.

## 5. Network discovery (out of scope)

External provider discovery (marketplace, cloud catalog) would be a new
milestone implementing `IProviderDiscoveryEngine` with network — not this module.

## 6. What stays frozen

All M1–M4.6 modules, all public contracts, and the four-step integration pattern.
