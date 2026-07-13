# M4.8 Routing Platform — Future Extension Report

## Integration bridge

Auto-populate `RoutingCandidate[]` from `IProviderDiscoveryEngine.discoverAll()`
filtered to `lifecycleState === "activated"`.

## Negotiation bridge

Accept `NegotiatedExecution.fallbackCandidates` as seed fallbacks after routing.

## Live telemetry

Replace static `estimatedLatencyMs` / `qualityScore` with telemetry-backed
`IRoutingHealthProvider` and `IRoutingHistory` fed by execution outcomes (without
coupling to runtime execution in this module).

## Policy store

External `IRoutingPolicy` registry for tenant-specific routing policies.

## What stays frozen

`RoutingRequest`, `RoutingPlan`, `IProviderRoutingEngine`, and all M4.1–M4.7 modules.
