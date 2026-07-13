# Naming Conventions

## Prefer

| Pattern | Example |
|---------|---------|
| Ports | `IEventBus`, `IIntelligenceKernel` |
| Registries | `ICapabilityRegistry` |
| Engines / runtimes (future) | `IOrchestrationEngine` |
| Policies | `IAuthorizationPolicy` |
| Adapters | `InMemoryEventBus`, `ConsoleTelemetry` |
| Errors | `ValidationError`, `KernelError` |
| Config loaders | `loadTelemetryConfig` |
| Branded IDs | `ExecutionId`, `CapabilityId` |
| Events | `intelligence.platform.ready` |

## Avoid

- `helpers`, `utilsAI`, `misc`, `commonAI`
- Model-specific methods: `callGPT`, `callClaude`
- Unbranded string IDs in public APIs
- Catch-all `utils/` folders at platform root

## Capability Names (future)

Verb/noun phrases describing work:

- `generateMarketingCopy`
- `analyzeBrief`
- `researchCompetitors`
