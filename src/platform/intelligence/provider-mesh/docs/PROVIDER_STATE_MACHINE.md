# Provider State Machine

## States

| State | Typical triggers |
|-------|------------------|
| `healthy` | Low error, good availability, utilization below busy threshold |
| `busy` | Capacity utilization ≥ 0.85 |
| `degraded` | Error rate ≥ 0.15, high timeouts, or worsening trend |
| `unavailable` | Error rate ≥ 0.5, availability < 0.3, rejected cert, disabled health |
| `maintenance` | Explicit maintenance flag |
| `experimental` | Experimental flag or certification |
| `deprecated` | Deprecated flag |
| `rate_limited` | Explicit flag or high error with high utilization |

## Priority (first match wins in evaluator)

1. maintenance  
2. deprecated  
3. experimental  
4. rate_limited  
5. unavailable  
6. degraded  
7. busy  
8. healthy  

States are **observed classifications**, not commands to providers.
