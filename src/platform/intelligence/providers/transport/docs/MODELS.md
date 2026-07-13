# M4.5 Transport Platform — Models & Diagrams

## 1. Transport Architecture Diagram

```
CanonicalProviderRequest
        │
        ▼
 ProviderTransportEngine ── publishes ──▶ ITransportEventPublisher (Noop | EventBus)
        │
        ▼
 TransportPipeline ──uses──▶ Serializer / Deserializer / ConnectionManager / Diagnostics
        │
        ▼
 TransportDispatcher ──uses──▶ ClientRegistry / Middleware / Retry / Timeout / Health
        │
        ▼
 ITransportClient (local | http | sdk | grpc | ws | sse | mcp | enterprise_gateway)
        │
        ▼
CanonicalProviderResponse
```

## 2. Pipeline Diagram

```
run(request, context)
  1. Validate        → ValidationError on bad input
  2. Open Session    → ConnectionManager.acquire() → TransportSession(open)
  3. Serialize       → CanonicalProviderRequest → TransportRequest (opaque body)
  4. Execute         → Dispatcher.dispatch() [middleware → timeout → retry → client]
  5. Deserialize     → TransportResponse → CanonicalProviderResponse
  6. Normalize       → attach measured TransportStatistics
  7. Close Session   → ConnectionManager.release() → TransportSession(closed)
```

## 3. Connection Lifecycle

```
        acquire()                     release()
 (new) ──────────▶ in_use ──execute──▶ in_use ──────────▶ idle (keep-alive)
                                                   └──────▶ closed (no keep-alive)

 idle ──acquire (reuse, useCount++)──▶ in_use
```

State union: `idle → acquired → in_use → released → closed`.

## 4. Pooling Model

```
InMemoryConnectionPool(poolId, protocol, manager, maxSize)
  acquire():
    if active >= maxSize → failure(pool_exhausted)
    else manager.acquire({protocol, poolId, keepAlive}) → track active
  release(conn): untrack active → manager.release(conn)
  stats(): { poolId, protocol, maxSize, active, idle, connectionIds }
```

In-memory only. A future distributed pool implements the same `IConnectionPool`.

## 5. Serialization Model

```
CanonicalProviderRequest ──serialize(session)──▶ TransportRequest
   payload (opaque)                                 body (opaque)
   target.operation                                 operation
   headers/streaming/timeout/compression            (carried through)

TransportResponse ──deserialize(request)──▶ CanonicalProviderResponse
   body (string|record)                        payload (opaque record)
   statusHint                                  success = statusHint < 400
```

Compression is applied by `CompressionMiddleware` using an `ICompressor`
(`IdentityCompressor` placeholder — records algorithm/bytes, no real codec).

## 6. Streaming Model

```
ITransportStreamingEngine
  normalizeChunk(raw, session, seq) → StreamingTransportChunk{kind: chunk|end, data, done}
  heartbeat(session, seq)           → {kind: heartbeat}
  complete(session, seq)            → {kind: end, done: true}
  cancel(session, seq)              → {kind: end, done: true}
```

Event kinds: `start | chunk | heartbeat | end | error`. No SSE/socket implementation.

## 7. Health Model

```
DefaultTransportHealthMonitor
  record(protocol, ok, latencyMs?)     → accumulate oks/fails
  protocolHealth(protocol):
     no samples          → unknown
     failRatio < 0.2      → healthy
     failRatio < 0.5      → degraded
     otherwise            → unhealthy
  connectionHealthy() / poolHealthy()  → true (in-memory)
```

## 8. Result Model

```
TransportResult
 ├─ success: boolean
 ├─ response?: CanonicalProviderResponse   (on success)
 ├─ error?:    TransportError              (on failure)
 ├─ statistics: TransportStatistics        (protocol, attempts, retries, latency, bytes)
 └─ sessionId, requestId, providerId, completedAt
```

`TransportError.kind ∈ connection | serialization | deserialization | protocol |
timeout | cancelled | pool_exhausted | unavailable | unknown`.
