# Provider Integration Platform (M4.7)

Coordinates how providers are **installed, registered, enabled, disabled,
discovered, versioned, and synchronized** across the Intelligence OS.

> No SDK packages. No networking. No HTTP. No provider execution.

## Architecture

```
Provider Manifest
      │
      ▼
Provider Integration Engine
      │
      ├── Registry
      ├── Discovery (manifest/registry only)
      ├── Installation / Activation
      ├── Version Management
      ├── Capability Synchronization
      ├── Compatibility Validation
      └── Lifecycle Management
      │
      ▼
ProviderIntegrationResult
```

## Quick start

```ts
import { createIntegrationPlatform, ProviderIntegrationRequestBuilder }
  from ".../providers/integration";
import { makeManifest } from ".../providers/adapters/testing";

const { engine } = createIntegrationPlatform();
const manifest = makeManifest();

const register = await engine.integrate(
  ProviderIntegrationRequestBuilder.create()
    .withRequestId("req_1")
    .withAction("register")
    .withManifest(manifest)
    .build()
);

const install = await engine.integrate(
  ProviderIntegrationRequestBuilder.create()
    .withRequestId("req_2")
    .withAction("install")
    .withManifest(manifest)
    .build()
);
```

## Lifecycle states

`registered → installed → activated ⇄ paused → disabled → deprecated → removed`

## Future provider integration (4 steps only)

1. **Provider Manifest** (M4.4)
2. **SDK Wrapper** (M4.6)
3. **Adapter** (M4.4)
4. **Integration Registration** (this module)

Nothing else in the platform should change.

See [`docs/`](./docs) for architecture review, diagrams, reports, and ACPs.
