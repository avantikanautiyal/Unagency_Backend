# Kernel Module (M1.1)

## Purpose

Operating-system kernel for the Intelligence Platform: lifecycle, DI, composition, registries, and health.

## Public API

| Export | Role |
|--------|------|
| `bootstrapIntelligencePlatform()` | Create container, kernel, register foundation, start |
| `shutdownIntelligencePlatform()` | Stop lifecycle, dispose services, clear registry |
| `IPlatformKernel` / `PlatformKernel` | Kernel surface |
| `ServiceContainer` | DI container |
| `ModuleRegistry` | Module registration |
| `LifecycleManager` | Module lifecycle coordination |
| `HealthManager` | Internal health checks |
| `CompositionRoot` | Sole wiring site for concrete implementations |

## Responsibilities

- Platform bootstrap / initialize / shutdown
- Constructor-injection DI (`ServiceContainer`)
- Composition root wiring (only place for `new` of foundation adapters)
- Module registry (`registerModule`, `validate`, …)
- Health manager (no HTTP)
- Platform metadata (`getVersion`, `getStatus`, `getInfo`)

## Usage

```typescript
import {
  bootstrapIntelligencePlatform,
  shutdownIntelligencePlatform,
} from "./platform/intelligence/kernel";

const kernel = await bootstrapIntelligencePlatform();
const status = kernel.getStatus();
const health = await kernel.health();
await shutdownIntelligencePlatform();
```

## Dependencies

- `shared`, `config`, `events`, `security`, `telemetry` (wired only in CompositionRoot)

## What This Module MUST NOT Do

- Execute AI capabilities
- Implement providers, catalog, planner, gateway
- Open HTTP routes
- Modify business modules
