# Capability Mapping Report

## Mapping source

Catalog → `catalogEntryToManifest` → generator capability matrix → Capability
Intelligence registry merge (`supportedProviders` / `supportedModels`).

## Coverage

`CapabilityProviderCoverage` marks a capability **multi-provider eligible** when
≥2 providers map to the same `capabilityId`.

## Outcome

Rollout reports `multiProviderCapabilityCount > 0`, enabling:

- Routing choice among providers
- Consensus across provider outputs
- Evaluation quality comparison
- Learning historical comparison
