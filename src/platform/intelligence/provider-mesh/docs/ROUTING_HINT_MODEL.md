# Routing Hint Model

## Targets (advisory)

`routing` · `negotiation` · `execution_intelligence` · `model_intelligence` · `consensus`

## Actions

| Action | Intent |
|--------|--------|
| `prefer` | Healthy + strong composite |
| `limit` | Busy / rate limited |
| `deprioritize` | Degraded / experimental / middling |
| `avoid` | Unavailable / maintenance / deprecated / very weak score |

## Consumer interfaces

`IRoutingMeshConsumer`, `INegotiationMeshConsumer`,
`IExecutionIntelligenceMeshConsumer`, `IModelIntelligenceMeshConsumer`,
`IConsensusMeshConsumer` — declared only; not wired.
