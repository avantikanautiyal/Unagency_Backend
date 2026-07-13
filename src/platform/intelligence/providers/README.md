# Provider Platform (M1.3)

## Purpose

Bounded context for **managing providers**.

Providers will execute AI in future milestones. This platform **never** performs AI execution and never imports vendor SDKs.

## Architecture

```
ProviderBuilder → ProviderRegistry → ProviderCapabilityMatrix
                         ↓
                  ProviderFactory → IProviderAdapter (placeholder)
```

## Folder structure

```
providers/
├── registry/           # IProviderRegistry
├── factory/            # ProviderFactory
├── adapters/           # IProviderAdapter (no vendor adapters)
├── metadata/           # ProviderDefinition, ProviderBuilder
├── capability-matrix/  # Feature matrix (moved here)
├── authentication/     # Auth contracts only
├── health/             # Health contracts + in-memory store
├── versioning/         # ProviderVersion, model version metadata
├── interfaces/
├── contracts/
├── types/
├── errors/
├── testing/
└── README.md
```

## Usage

```typescript
import {
  ProviderRegistry,
  ProviderFactory,
  ProviderCapabilityMatrix,
  InMemoryProviderHealthStore,
  ProviderBuilder,
} from "./platform/intelligence/providers";

const health = new InMemoryProviderHealthStore();
const matrix = new ProviderCapabilityMatrix();
const registry = new ProviderRegistry(health, matrix);
const factory = new ProviderFactory();

const provider = ProviderBuilder.create()
  .withId("provider-a")
  .withVendor("example")
  .withDisplayName("Example")
  .withVersion("1.0.0")
  .withModalities("text")
  .withStatus("active")
  .build();

registry.registerProvider(provider);
const adapter = factory.createAdapter(provider);
```

## Lifecycle

```
Draft → Active → Degraded / Maintenance / Deprecated → Disabled / Offline
```

Health statuses: `healthy`, `degraded`, `offline`, `maintenance`, `deprecated`.

## Boundaries / MUST NOT

- Import OpenAI, Anthropic, Gemini, or any SDK
- Perform HTTP or AI execution
- Implement Execution Planner or Gateway
- Modify Kernel or Capability Management modules
