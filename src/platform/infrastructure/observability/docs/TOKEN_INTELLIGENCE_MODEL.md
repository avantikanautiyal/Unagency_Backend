# Token Intelligence Model

## Record

`TokenUsageRecord` tracks:

| Field | Meaning |
|-------|---------|
| `promptTokens` | Input |
| `completionTokens` | Output |
| `cachedTokens` | Cache hits |
| `streamingTokens` | Streamed chunks / tokens |
| `toolTokens` | Tool / function usage |
| `visionTokens` | Multimodal vision |
| `audioTokens` | Audio / speech |
| `totalTokens` | Rollup |

## Aggregation

`aggregateTokens` sums each dimension and total across filtered records
(organization, provider, since).
