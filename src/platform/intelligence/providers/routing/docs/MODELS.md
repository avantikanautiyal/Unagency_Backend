# M4.8 Routing Platform — Models & Diagrams

## Scoring Model

Ten normalized dimensions (0–1), averaged for `total`:

| Dimension | Source |
|-----------|--------|
| capability | candidate.capabilities vs request.capabilityId |
| health | candidate.healthy |
| latency | inverse of estimatedLatencyMs |
| quality | qualityScore or history |
| cost | inverse of estimatedCost |
| availability | candidate.availability |
| preference | preferred/excluded providers |
| region | preference.region match |
| compliance | compliance engine (default 1) |
| priority | candidate.priority |

## Decision Pipeline

1. Validate request
2. Resolve preferences (exclude, region)
3. Filter by compliance constraints
4. Score all candidates
5. Rank by strategy
6. Select primary (rank #1; load balancer for `multi_provider` only)
7. Build failover chain
8. Assign experiments (canary/shadow/rollout)
9. Emit `RoutingPlan` + `RoutingDecision`

## Strategy Matrix

| Strategy | Ranking key |
|----------|-------------|
| lowest_cost | dimensions.cost |
| lowest_latency | dimensions.latency |
| highest_quality | dimensions.quality |
| provider_preference | dimensions.preference |
| compliance | dimensions.compliance |
| health_first | dimensions.health |
| balanced | total score |
| weighted | policy.strategy.weights |
| random | seeded shuffle |
| sticky | stickyKey hash |
| canary | balanced + canary experiment |
| shadow | balanced + shadow experiment |
| multi_provider | balanced + load balancer |

## Failover Model

`FailoverStep` chain: primary → fallbacks → optional `regional_fallback`.

## Load Balancing Model

`round_robin | weighted | least_loaded | priority | random` — used when
`strategy === multi_provider`.

## Experiment Model

- **Canary**: 10% traffic to first fallback
- **Shadow**: duplicate request to shadow provider (no user impact)
- **Weighted rollout**: 25% when `policy.allowExperimental`

## Registry / Topology

`RoutingTopology` nodes: providerId, region, weight, healthy — built from candidates.
