# Official Provider Catalog Integration

First production provider integration for UNAGENCY Intelligence OS.

## Flow

```
Provider Catalog (seed)
        ↓
catalogEntryToManifest()
        ↓
Universal Provider Generator.generate()
        ↓
instantiateCatalogProvider()  → discoverModels() / resolveModel()
        ↓
OS registration (Mesh, Capability Intelligence, Runtime-ready, …)
        ↓
ACTIVE only if catalog certification gate passes
```

## Usage

```ts
import { createProviderCatalogPlatform } from "./index";

const { engine } = createProviderCatalogPlatform();
const report = await engine.integrate({ requestId: "catalog_v1" });
```

## Rules

- Every provider in the spreadsheet seed is integrated — none invented, none skipped.
- Every provider passes through the Universal Provider Generator (no hardcoded leaves).
- OpenAI marks `existingLeaf` and does not overwrite the frozen OpenAI package.
- Business callers use capabilities → `resolveModel()`, never brand names.
- Models bootstrap from the catalog until live `discoverModels()` hits the provider API.
