# M4.7 Provider Integration Platform — Architecture Review

## 1. Mission

Coordinate how providers are **installed, registered, enabled, disabled,
discovered, versioned, and synchronized** — without provider execution,
networking, or SDK packages.

## 2. Position in the provider stack

```
Manifest (M4.4) → Integration (M4.7) → Registry/Discovery/Sync
                         ↓
              Adapter (M4.4) + SDK (M4.6) + Transport (M4.5)
                         ↓
                   (future execution)
```

Integration is the **control plane for provider presence** on the platform. It
does not execute providers; it makes them discoverable, validated, and lifecycle-managed.

## 3. Integration Architecture Diagram

```
ProviderIntegrationRequest
        │
        ▼
ProviderIntegrationEngine
        │
        ├── IProviderIntegrationRegistry
        ├── IProviderInstaller
        ├── IProviderActivator
        ├── IProviderDiscoveryEngine
        ├── IProviderSynchronizationEngine
        ├── IProviderCompatibilityEngine
        ├── IProviderLifecycleManager
        ├── IProviderVersionManager
        ├── IProviderIntegrationHealthMonitor
        └── IProviderIntegrationDiagnostics
        │
        ▼
ProviderIntegrationResult
```

## 4. Design principles

| Principle | Application |
|-----------|-------------|
| No execution | Engine orchestrates metadata only |
| Manifest-driven | Discovery/sync read manifests + registry |
| Lifecycle safety | State machine with enforced transitions |
| Provider independence | Uses `ProviderManifest` contracts only |
| Extensibility | New provider = manifest + registration call |

## 5. Dependency graph

```
integration
 ├─▶ adapters/contracts (ProviderManifest)
 ├─▶ sdk/contracts (optional future bridge)
 ├─▶ negotiation/contracts (optional future compat)
 ├─▶ shared, events, telemetry

integration ⇏ runtime, gateway, business, SDK packages, HTTP
```

## 6. Success criteria

A provider can be registered, discovered, activated, versioned, validated, and
synchronized without modifying any frozen module.
