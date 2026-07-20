# Provider Mesh Architecture

```
                    ┌─────────────────────┐
                    │ ProviderMeshRequest │
                    │  (events, filters)  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ ProviderMeshEngine  │
                    └──┬──────┬──────┬────┘
                       │      │      │
           ┌───────────┘      │      └───────────┐
           ▼                  ▼                  ▼
    TelemetryAggregator  HealthEvaluator   ProviderScorer
           │                  │                  │
           └──────────┬───────┴────────┬─────────┘
                      ▼                ▼
              OperationalRecord   CompositeScore
                      │
        ┌─────────────┼──────────────┬─────────────┐
        ▼             ▼              ▼             ▼
 RoutingHints   FailoverPlanner  CanaryPlanner  ShadowPlanner
        │             │              │             │
        └─────────────┴──────┬───────┴─────────────┘
                             ▼
                   ProviderMeshSnapshot
                             │
              (advisory only → downstream engines)
```

## Folder map

See module root. Core path: `engine/`, `registry/`, `health/`, `telemetry/`,
`provider-score/`, `routing-hints/`, `failover/`, `canary/`, `shadow/`.
