# Distributed Execution Platform

Enterprise infrastructure for reliable, scalable job execution.

**Not** Intelligence. **Not** Provider Logic.

Workers execute jobs by consuming the Intelligence Integration Layer (and optionally
Production Validation). The Intelligence OS remains unchanged.

## Flow

```
Client → enqueue → Queue → Priority → Worker Reservation
  → Worker → Integration Layer → Runtime → Provider → Completion
```

## Usage

```ts
import { createDistributedExecutionPlatform } from "./index";

const { engine } = createDistributedExecutionPlatform({
  useIntegrationLayer: true, // or default stub for tests
});

const job = await engine.enqueue({
  payload: { rawPrompt: "Launch a campaign", organizationId: "org_1" },
  priority: "high",
});

await engine.tick(4); // pump workers
```

## Persistence

Default: in-memory (`IJobStore`). Architecture-ready for Redis / BullMQ / Kafka /
SQS / Pub/Sub in a later milestone — **no external deps yet**.
