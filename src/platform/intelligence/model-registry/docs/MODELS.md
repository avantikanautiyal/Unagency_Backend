# M5.1 Model Registry — Models & Diagrams

## Canonical Provider Model

`CanonicalProvider`: providerId, vendor, displayName, departments, modalities,
regions, lifecycleState.

## Canonical Model Manifest

`CanonicalModel`: all required fields — providerId, modelId, displayName, version,
modalities, capabilities, input/output types, flags, limits, pricing, latency/quality
tiers, availability, regions, lifecycle, compatibility.

## Discovery Architecture

`discoverAll()` → providers + models + capabilities  
`discoverProvider(id)` → scoped discovery  
`listCapabilities()` → unique capability IDs

## Validation Pipeline

1. Validate provider manifest (displayName, modelIds, capabilities)
2. Validate model manifest (limits, pricing, capabilities, regions)
3. Validate registry consistency (providers have models)
4. Lifecycle transition rules

## Capability Mapping Model

`ModelCapability`: capabilityId, label, supported  
`ModelCapabilityFlags`: streaming, functionCalling, reasoning, vision, etc.

## Pricing Model

`ModelPricing`: input/output per 1k tokens, per-request, currency

## Lifecycle Model

States: draft → preview → active → deprecated → retired

## Dependency Graph

```
ModelRegistryEngine → InMemoryModelRegistryStore
  → Seed Inventory (data only)
  ⇏ Frozen M4 modules
```
