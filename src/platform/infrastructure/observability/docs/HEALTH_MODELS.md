# Health Models

## Status

`healthy` \| `degraded` \| `unhealthy` \| `unknown`

## Components

Health checks cover:

- Platform
- Provider
- Worker
- Queue
- Secret
- Execution
- Runtime

`PlatformHealthSnapshot` rolls component results into overall status
(`aggregateHealth` / `engine.health()`).
