# Unit Test Summary — Provider Mesh

| Test | Intent |
|------|--------|
| Multi-provider snapshot completeness | States, scores, hints, failover, canary, shadow, explainability |
| Healthy vs degraded classification | State machine |
| Prefer high-score providers in hints | Scoring → hints |
| Failover ordered by score | Failover model |
| Experimental canary plan | Canary model |
| Shadow recommendations without execution | Shadow model |
| Validation rejects empty events | Input validation |
| No SDK / networking required | Boundary |

Tests live under `tests/platform/intelligence/provider-mesh/`.
