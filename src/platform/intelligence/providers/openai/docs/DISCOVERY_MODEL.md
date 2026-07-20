# OpenAI Discovery Model

## Flow

```
IOpenAIHttpClient GET /models
  → enrichDiscoveredModel (capability inference)
  → cache (TTL)
  → buildManifestFromDiscovery
```

## Cache

`DEFAULT_MODEL_CACHE_TTL_MS` = 15 minutes. `forceRefresh` bypasses cache.

## Sources

`live` | `simulated` | `cache`

## Location

`discovery/model-discovery.ts`, `capabilities/capability-enricher.ts`
