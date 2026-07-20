# Provider Catalog — Architecture Review

## Verdict

Additive catalog integration module. Reuses Universal Provider Generator, Provider Mesh, and Capability Intelligence via public APIs. No redesign of Runtime, Routing, Negotiation, Model Intelligence, Evaluation, or Experience Intelligence.

## Architecture

```
Spreadsheet seed (PROVIDER_CATALOG_SEED)
        │
        ▼
catalogEntryToManifest  ──►  ProviderManifestSpec
        │
        ▼
ProviderGeneratorEngine.generate (dry_run)
        │
        ▼
instantiateCatalogProvider (discoverModels / resolveModel)
        │
        ▼
registerProviderWithOs → Mesh.observe + CapabilityRegistry.register
```

## Constraints honored

| Constraint | How |
|------------|-----|
| No hardcoded provider leaves | Generation only; OpenAI leaf marked `existingLeaf` |
| No invented providers | Seed = spreadsheet only |
| Capability-first | `resolveModel(DesiredCapabilityProfile)` |
| Dynamic discovery | `discoverModels()` with catalog bootstrap fallback |
| ACTIVE only after cert gate | `evaluateCatalogCertification` |

## Non-goals

- Does not rewrite frozen OpenAI package to disk
- Does not invent architecture for Runtime/Routing
- Live HTTP discovery deferred until credentials + network path enabled
