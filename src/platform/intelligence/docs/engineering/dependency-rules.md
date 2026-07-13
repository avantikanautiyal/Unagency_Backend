# Dependency Rules

## Allowed Graph (Foundation)

```
shared
  ↑
  ├── config, events, security, telemetry
  ├── policies
  ├── runtime
  ├── scheduler
  ├── capability-catalog              (shared only)
  ├── provider-capability-matrix      (shared only)
  ├── execution-planner ──► catalog, matrix, policies (interfaces only)
  ├── kernel (registry + health)
  ├── cli / playground
  └── testing
```

## Future M1 Graph

```
Business modules
  → IIntelligenceGateway (only)
      → IExecutionPlanner
          → ICapabilityCatalog
          → IProviderCapabilityMatrix
          → IPolicyEngine
      → Orchestrator (consumes ExecutionPlan)
          → Execution Engine
              → Provider adapters (leaf)
```

## Forbidden

| From | To | Reason |
|------|----|--------|
| Any module except `config` | `process.env` | Centralized configuration |
| Business modules | intelligence internals | Gateway only (M1) |
| capability-catalog | planner / providers | Metadata only |
| provider-capability-matrix | provider modules | Features only |
| execution-planner | provider SDKs | Provider-independent |
| Foundation modules | MongoDB / Redis / BullMQ / Kafka | Deferred |
| `shared` | any other intelligence module | Shared is the root |
| Circular imports | — | Use events or ports |

## Composition

Only `kernel/composition` may construct concrete adapters and wire them to interfaces.
