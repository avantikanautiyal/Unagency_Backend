# Implementation Report

| Component | Path |
|-----------|------|
| Engine | `engine/distributed-execution-engine.ts` |
| Queues | `queues/queue-registry.ts` |
| Workers / Executors | `workers/` |
| Retry | `retries/retry-policy.ts` |
| Dead letter | `dead-letter/dead-letter-store.ts` |
| Cancellation | `cancellation/cancellation.ts` |
| Concurrency | `concurrency/concurrency-limiter.ts` |
| Leases / Reservations | `leases/`, `reservations/` |
| Scheduler / Dispatcher | `scheduler/`, `dispatcher/` |
| Batch / Throttle / Progress | `batching/`, `throttling/`, `progress/` |
| Factory | `factories/create-distributed-execution-platform.ts` |

Default executor: stub. Set `useIntegrationLayer: true` to pipe jobs into the OS.
