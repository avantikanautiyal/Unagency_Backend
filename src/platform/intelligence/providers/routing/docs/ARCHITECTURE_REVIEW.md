# M4.8 Provider Routing & Decision Engine — Architecture Review

## Mission

Given multiple capable providers, **decide which provider(s) should execute**
without performing any provider execution, networking, or SDK calls.

## Position

```
Negotiation (decides IF) → Routing (decides WHICH) → Runtime (executes)
Integration (inventory) ──┘
```

## Architecture

```
RoutingRequest
    │
    ▼
ProviderRoutingEngine
    ├── PreferenceResolver (exclude/region)
    ├── ComplianceEngine (constraints)
    ├── Scorer (10 dimensions)
    ├── Ranker → Strategy (13 kinds)
    ├── LoadBalancer (multi_provider only)
    ├── FailoverEngine (fallback chain)
    ├── ExperimentEngine (canary/rollout)
    ├── ShadowEngine (shadow traffic)
    └── Diagnostics / Topology
    │
    ▼
RoutingDecision + RoutingPlan
```

## Dependencies

```
routing → integration contracts (discovery-shaped candidates, optional)
routing → negotiation contracts (capability context, optional)
routing → shared, events, telemetry
routing ⇏ runtime execution, SDK, HTTP, business modules
```

## Success criteria

Given ten capable providers, the engine deterministically produces an optimal
`RoutingPlan` with primary, fallbacks, failover chain, and optional experiments.
