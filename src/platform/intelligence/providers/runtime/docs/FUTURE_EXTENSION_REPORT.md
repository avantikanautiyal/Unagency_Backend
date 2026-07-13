# Provider Runtime — Future Extension Report (M4.1)

How later milestones extend the runtime **without modifying it**.

---

## 1. Provider adapters (M4.2+)

Concrete adapters (OpenAI, Claude, Gemini, …) implement `IProviderDispatcher`
and are injected via `createProviderRuntime({ dispatcher })`. The runtime,
pipeline, and contracts remain unchanged.

```ts
class OpenAIDispatcher implements IProviderDispatcher {
  async dispatch(request, token) { /* map → SDK call → ProviderExecutionResponse */ }
  supportsStreaming() { return true; }
  async dispatchStreaming(request, token, onChunk) { /* SSE → onChunk(...) */ }
}
```

Adapters are **leaf nodes** — they hold the only SDK/auth/networking code and
depend on the runtime contracts, never the reverse.

## 2. Authentication (M4.x)

Credential resolution and injection live **inside adapters** (or an adapter
factory), never in the runtime. Per-tenant credentials key off
`ProviderExecutionContext.organizationId` / `workspaceId`.

## 3. Streaming transports

`IStreamingRuntime` already models chunk accumulation. SSE / WebSocket / HTTP
stream transports are implemented in adapters that call the injected `onChunk`
listener; the runtime's streaming coordination is transport-agnostic.

## 4. Jitter

`JitterMode` and `IJitterStrategy` are declared. A future `FullJitterStrategy`
is injected into `RetryEngine` without contract changes.

## 5. Durable queue / sessions

`IExecutionQueue` and `IProviderSessionStore` are ports. Durable adapters
(database/stream-backed) replace the in-memory defaults via the factory. No
BullMQ/Redis coupling exists today.

## 6. Provider health integration

`ICircuitBreaker` can be backed by, or feed, the Provider Health Store so that
health and breaker state converge. The `ICircuitBreakerRegistry` seam allows a
health-aware registry to be injected.

## 7. Distributed coordination

Reservations/leases are intentionally in-process. A distributed
`IConcurrencyManager` (e.g. lease store) can be injected later; the lease/
reservation contracts already carry ids and owners for that purpose.

## 8. Gateway / planning bridge

A future bridge converts an approved `ExecutionPlan` (+ `CompiledPrompt`
projection) into a `ProviderExecutionRequest` and calls `runtime.execute`. This
belongs in a composition layer, not in the runtime — see ACP-R1/R2.

## 9. Telemetry & analytics

`IProviderRuntimeEventPublisher` emits lifecycle events; the bus-backed
publisher already bridges to `IEventBus`. Analytics (M10) consumes these events
plus `ProviderRuntimeSnapshot` without runtime changes.
