# Dynamic Model Discovery Report

## Contract

Every catalog provider platform implements:

```ts
discoverModels(force?: boolean): Promise<Result<{ models; source }>>
```

## Sources

| Source | When |
|--------|------|
| `catalog_bootstrap` | First discovery; spreadsheet inventory |
| `cache` | Subsequent calls until `force=true` |

## Live path (enabled later)

```
Provider API discoveryEndpoint
        ↓
Model Discovery
        ↓
Capability Discovery
        ↓
Canonical Model Registry
        ↓
Provider Mesh
        ↓
Model Intelligence / Capability Intelligence
```

## Rules

- Model labels from the spreadsheet are bootstrap inventory only
- Internal IDs are `providerId:slug-label` — not business targets
- Generated packages include discovery artifacts that never hardcode GPT/Claude/Gemini as constants for callers
- When live discovery is enabled, replace bootstrap without changing OS architecture
