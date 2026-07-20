# Model Registry Platform (M5.1)

Canonical metadata layer for every AI provider and model supported by UNAGENCY.
**Not** execution, adapters, or SDK integration.

## Quick start

```ts
import { createModelRegistryPlatform } from ".../model-registry";

const { registry, discovery, search } = createModelRegistryPlatform();
const models = await search.search({ capability: "text.chat", latencyTier: "ultra_low" });
```

See [`docs/`](./docs) for architecture review and models.
