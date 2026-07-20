# Dependency Graph

```
provider-mesh
  ├── shared/result
  ├── shared/errors
  ├── shared/identifiers
  ├── providers/runtime/contracts (ProviderExecutionResult) [read-only]
  ├── execution-optimization/contracts (ProviderObservabilityReport) [read-only]
  ├── providers/adapters/contracts (ProviderHealthSummary) [read-only]
  └── provider-certification/contracts (CertificationStatus) [read-only]

Does NOT depend on:
  routing engines, runtime executors, consensus engine, negotiation,
  OpenAI SDK/dispatcher, transport, networking
```

Downstream consumers (future): Routing, Model Intelligence, Execution Intelligence, Consensus.
