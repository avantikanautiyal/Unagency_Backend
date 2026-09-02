# Provider Runtime (M4.1)

Executes provider requests through a complete, **provider-independent** runtime
lifecycle. Contains **no** vendor SDKs, authentication, networking, or
persistence. Future provider adapters (M4.2+) plug in via `IProviderDispatcher`
without modifying this runtime.

```
ExecutionPlan
    ↓
ProviderExecutionRequest
    ↓
Provider Runtime
    ↓
Provider Session
    ↓
Execution Pipeline
    ↓
Provider Adapter (future — via IProviderDispatcher)
    ↓
ProviderExecutionResponse
```

## Folder structure

```
runtime/
├── engine/             # ProviderRuntime (IProviderRuntime)
├── sessions/           # session, state machine, in-memory store
├── dispatcher/         # PlaceholderProviderDispatcher (no SDK)
├── execution/          # ExecutionPipeline (retry/timeout/stream/cancel)
├── streaming/          # StreamingRuntime + accumulator (placeholder)
├── retry/              # RetryEngine (fixed/linear/exp/immediate)
├── timeout/            # TimeoutEngine (execution/streaming/queue)
├── cancellation/       # CancellationEngine + source (propagation)
├── circuit-breaker/    # CircuitBreaker + registry (closed/open/half-open)
├── concurrency/        # ConcurrencyManager (reservations + leases)
├── queue/              # InMemoryExecutionQueue (priority + FIFO)
├── monitor/            # ProviderExecutionMonitor (phase timings)
├── metrics/            # ProviderRuntimeMetrics (aggregate stats/snapshot)
├── lifecycle/          # lifecycle phases
├── builders/           # ProviderExecutionRequestBuilder
├── events/             # event publishers (noop + bus-backed)
├── contracts/          # immutable public contracts
├── interfaces/         # ports
├── factories/          # createProviderRuntime
├── testing/            # ControllableDispatcher + fixtures
```

## Usage

```ts
import { createProviderRuntime } from "./factories/create-provider-runtime";
import { ProviderExecutionRequestBuilder } from "./builders";

const runtime = createProviderRuntime({ maxConcurrent: 8 });

const request = new ProviderExecutionRequestBuilder()
  .withRequestId("req_1")
  .withContext(ctx)
  .withCapability(capabilityId)
  .withProvider(providerId, "model-x")
  .withPayload({ prompt: "..." })
  .withRetryPolicy({ strategy: "exponential", maxAttempts: 3, baseDelayMs: 100 })
  .withTimeoutPolicy({ executionTimeoutMs: 30_000 })
  .build();

const result = await runtime.execute(request);
```

The default dispatcher is a **placeholder** that returns a synthetic,
provider-independent response so the full lifecycle can complete end-to-end
without any provider SDK. Replace it by passing a custom `IProviderDispatcher`.

## Rules honored

- Constructor injection only; interfaces everywhere; immutable contracts.
- `Result<T>` for expected failures; no service locator.
- No OpenAI / Anthropic / Gemini / provider SDKs / authentication.
- No networking, no persistence, no Redis / BullMQ / Kafka.
