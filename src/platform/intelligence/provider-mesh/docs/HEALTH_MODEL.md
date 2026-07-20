# Health Model

## Inputs

- Aggregated telemetry window (error/timeout/availability/utilization/trend)
- Latest mesh event flags (`maintenance`, `rateLimited`, `deprecated`, `experimental`)
- Certification status
- Optional `ProviderHealthSummary`

## Health score

```
healthScore =
  availability * 0.45 +
  (1 - errorRate) * 0.35 +
  (1 - timeoutRate) * 0.10 +
  stateBonus * 0.10
```

## Outcomes

Produces `state`, `healthScore`, and an explanation string used by the
operational record and all downstream recommendations.
