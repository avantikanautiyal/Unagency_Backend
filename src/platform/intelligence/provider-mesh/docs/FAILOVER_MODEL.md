# Failover Model

## Behavior

For each eligible provider (healthy, busy, experimental, degraded, rate_limited),
produce an ordered failover chain:

1. Primary = that provider  
2. Fallbacks = remaining eligible providers sorted by composite score desc  

## Non-behavior

- Does **not** execute failover traffic  
- Does **not** mutate Routing  

## Explainability

Every chain includes why, metrics, evidence, and confidence.
