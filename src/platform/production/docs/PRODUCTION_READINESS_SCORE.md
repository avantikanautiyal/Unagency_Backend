# Production Readiness Score

```
overall = 0.30*execution + 0.25*provider + 0.20*capability + 0.25*workflow
          − 0.05 * hard_fail_count
```

| Grade | Overall |
|-------|---------|
| A | ≥ 0.90 |
| B | ≥ 0.80 |
| C | ≥ 0.70 |
| D | ≥ 0.55 |
| F | < 0.55 |

`readyForProduction` when pipeline succeeded, overall ≥ 0.75, and fail penalty < 0.2.
