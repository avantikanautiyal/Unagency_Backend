# Provider Scoring Model

## Dimensions (0–1)

| Dimension | Derivation |
|-----------|------------|
| Availability | Telemetry availability |
| Latency | Inverse of blended avg/p95 latency |
| Reliability | Inverse of error/retry/timeout rates |
| Quality | Average quality from observability |
| Historical Success | Success rate |
| Cost | Inverse soft cost normalization |
| Certification | Mapped boost from certification status |
| Current Load | `1 - capacityUtilization` |

## Weights (`SCORE_WEIGHTS`)

Availability 0.20 · Latency 0.15 · Reliability 0.20 · Quality 0.15 ·
Historical Success 0.10 · Cost 0.05 · Certification 0.10 · Current Load 0.05

Overall is weighted sum, then lightly blended with health score (90/10).

## Outputs

`ProviderScoreBreakdown` plus convenience fields:
health / performance / reliability / availability scores on the operational record.
