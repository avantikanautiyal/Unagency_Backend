# Runtime Registration Report

## Registration path

`registerProviderWithOs` (catalog public API) — additive mesh observe + capability
registry. Runtime / Routing / Negotiation modules are **not** modified.

## Flags per provider

| Flag | Meaning |
|------|---------|
| `runtime` | Dispatcher-injection ready |
| `negotiation` | Negotiation candidate eligible |
| `routing` | Routing candidate eligible |
| `mesh` | Mesh health observed |
| `consensus` | Consensus participant eligible |
| `certification` | Catalog certification gate |
| `capabilityIntelligence` | Capability defs registered |
| `integrationLayer` | Integration-compatible |
| `secretCompatible` | Secret env hint present |
| `distributedExecutionCompatible` | Job executor compatible |
| `observabilityCompatible` | Evidence publishable |

OpenAI: `usedExistingOpenAILeaf = true`.
