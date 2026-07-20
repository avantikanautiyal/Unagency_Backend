# Concurrency Model

- **ConcurrencyLimiter** — global execution slots / backpressure
- **Worker capacity** — per-worker active job caps
- **Leases** — time-bounded worker ownership of a job
- **Reservations** — claim before run
- **ThrottleController** — org/workspace (and extensible provider/capability) limits

Fair scheduling via rotating dispatcher order with priority queue bias.
