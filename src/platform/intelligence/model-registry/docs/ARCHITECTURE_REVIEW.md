# M5.1 Model Registry — Architecture Review

## Mission

Single source of truth for provider and model metadata — capabilities, pricing,
limits, regions, modalities, and lifecycle — without provider execution.

## Position

```
Model Registry (M5.1) → Planning / Routing / Negotiation / Execution Intelligence
                     ⇏ Adapters / SDK / Runtime
```

## Architecture

```
Seed Inventory (data)
    │
    ▼
ModelRegistryEngine
    ├── ProviderManifestRegistry
    ├── ModelDiscoveryEngine
    ├── ModelSearchEngine
    ├── ValidationEngine
    ├── CompatibilityEngine
    ├── LifecycleManager
    ├── PricingEngine
    ├── LimitsEngine
    └── RegionEngine
    │
    ▼
CanonicalProvider + CanonicalModel (immutable)
```

## Dependencies

```
model-registry → shared, events, telemetry, configuration
model-registry ⇏ SDK, adapters, transport, runtime, routing, negotiation, business
```

## Success criteria

Register, search, discover, filter, and validate canonical model metadata
without any provider execution.
