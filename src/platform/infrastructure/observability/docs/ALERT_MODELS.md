# Alert Models

## Kinds

| Kind | Trigger (engine evaluation) |
|------|------------------------------|
| `latency` | High duration spans / metrics |
| `cost` | Burst or unusual cost velocity |
| `failure` | Error spans / failure rates |
| `provider_down` | Provider surface unhealthy / errors |
| `queue_saturation` | Queue depth / backlog metrics |
| `worker_saturation` | Worker utilization metrics |
| `retry_storm` | Elevated retry counts |
| `budget_threshold` | Spend vs configured budget |
| `secret_expiration` | Secret health / expiry signals |

## Record

`AlertRecord`: kind, severity (`info` \| `warning` \| `critical`), message,
timestamps, active flag, optional context.

Evaluated via `evaluateAlerts()`; listed via `listAlerts`.
