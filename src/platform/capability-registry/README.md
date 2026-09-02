# Capability Registry

## Purpose

Source of truth for **what** the platform can do (capability catalogue).

Registers, versions, validates, and resolves capabilities. Never executes them.

## Responsibilities

- register / unregister / replace capabilities
- validate definitions
- resolve by id and version/channel
- list and version queries
- capability lifecycle status transitions on replace

## Architecture

```
CapabilityBuilder → CapabilityValidator → CapabilityRegistry
                                              ↓
                                    Capability Catalog (read-only)
                                              ↓
                                    Future Planner
```

## Public interfaces

| Interface | Role |
|-----------|------|
| `ICapabilityRegistry` | Source-of-truth operations |
| `ICapabilityValidator` | Pre-registration validation |

## Implemented classes

| Class | Role |
|-------|------|
| `CapabilityRegistry` | In-memory registry |
| `CapabilityValidator` | Validation → `Result` |
| `CapabilityBuilder` | Fluent definition builder |
| `CapabilityVersion` | Semver value object |
| `CapabilityRegistryFactory` | Non-singleton factory |

## Usage

```typescript
import {
  CapabilityBuilder,
  CapabilityRegistry,
  asProviderId,
} from "./platform/capability-registry";

const registry = new CapabilityRegistry();

const capability = CapabilityBuilder.create()
  .withId("analyzeBrief")
  .withName("analyzeBrief")
  .withVersion("1.0.0")
  .withDescription("Analyze a project brief")
  .withCategory("requirements", "analysis")
  .withOwner("platform")
  .withModalities("text")
  .withInputSchema({ contentTypes: ["text/plain"] })
  .withOutputSchema({ contentTypes: ["application/json"] })
  .withProviderCompatibility({
    compatibleProviderIds: [asProviderId("provider-a")],
  })
  .withDefaultProvider("provider-a")
  .withStatus("published")
  .build();

registry.register(capability);
```

## Sequence — registration

```
Caller
  → CapabilityBuilder.build()
  → CapabilityValidator.validate() → Result
  → CapabilityRegistry.register()
```

## Lifecycle

```
Draft → Experimental → Published → Deprecated → Archived
                ↘ Disabled ↗
```

## Boundaries / MUST NOT

- Execute AI or call providers
- Own discovery/search (catalog does)
- Implement policies (references only)
- Depend on planner, gateway, or business modules
- Use static singleton registries
