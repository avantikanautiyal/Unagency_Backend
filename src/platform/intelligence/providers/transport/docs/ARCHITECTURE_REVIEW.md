# M4.5 Provider Transport Platform — Architecture Review

## 1. Mission

Deliver a **provider-independent transport layer** that carries a
`CanonicalProviderRequest` to some communication mechanism and returns a
`CanonicalProviderResponse`. The transport platform is the *only* thing a future
provider adapter talks to when it needs to "send" a request. It hides HTTP, SDKs,
gRPC, WebSocket, SSE, local runtime, and future MCP / enterprise-gateway transports.

**Not in scope (by rule):** networking, provider SDKs, HTTP implementation,
persistence, and any concrete provider (OpenAI/Anthropic/Gemini/Groq/DeepSeek/
Mistral/OpenRouter).

## 2. Position in the provider stack

```
Negotiation (M4.3)  →  Adapter (M4.4)  →  Transport (M4.5)  →  [future wire]
   decides                translates            delivers
NegotiatedExecution   ProviderWirePayload   CanonicalProviderRequest/Response
```

The adapter produces an **opaque** `ProviderWirePayload`. The transport platform
accepts it inside a `CanonicalProviderRequest`, delivers it, and returns the raw
response payload inside a `CanonicalProviderResponse`. Neither side interprets the
payload — that keeps transport 100% provider-independent.

## 3. Architecture diagram

```
                         ┌───────────────────────────────────────────┐
 CanonicalProviderRequest│           ProviderTransportEngine          │
────────────────────────▶│  (create context + session id, publish)    │
                         └───────────────────┬───────────────────────┘
                                             │ run
                                             ▼
                         ┌───────────────────────────────────────────┐
                         │              TransportPipeline              │
                         │ Validate→OpenSession→Serialize→Execute→     │
                         │ Deserialize→Normalize→CloseSession          │
                         └───┬───────────────┬───────────────┬────────┘
                             │               │               │
             ITransportSerializer   IConnectionManager   ITransportDeserializer
                             │               │               │
                             ▼               ▼               ▼
                         ┌───────────────────────────────────────────┐
                         │              TransportDispatcher            │
                         │  resolve client → middleware → timeout →    │
                         │  retry                                      │
                         └───┬───────────────┬───────────────┬────────┘
                             │               │               │
               ITransportClientRegistry  Middleware chain  Retry/Timeout engines
                             │
                             ▼
        ┌────────── ITransportClient (by protocol) ──────────┐
        │ local (functional)   http/sdk/grpc/ws/sse (placeholder) │
        └───────────────────────────────────────────────────────┘
                                             │
                          CanonicalProviderResponse (+ TransportStatistics)
```

## 4. Design principles

| Principle | How it is applied |
|-----------|-------------------|
| Dependency Inversion | Every subsystem is an interface; the engine composes ports. |
| Single Responsibility | Serialize, dispatch, retry, timeout, pool, health are separate. |
| Open/Closed | New protocols = new `ITransportClient`; adapters/engine unchanged. |
| Provider independence | Only opaque `ProviderWirePayload` crosses the boundary. |
| Immutability | All contracts are `readonly`; the builder freezes output. |
| Result pattern | All fallible operations return `Result<T>`; no control-flow throws. |

## 5. Public contracts

`CanonicalProviderRequest`, `CanonicalProviderResponse`, `TransportRequest`,
`TransportResponse`, `TransportContext`, `TransportMetadata`, `TransportResult`,
`TransportSession`, `TransportConnection`, `TransportPool`, `TransportHealth`,
`TransportProtocol`, `TransportCapability`, `TransportStatistics`,
`TransportSnapshot`, `TransportError`, `StreamingTransportChunk`.

## 6. Dependency graph

```
transport
 ├─▶ shared            (Result, errors, identifiers)
 ├─▶ events            (optional event publisher)
 ├─▶ adapters/contracts (ProviderWirePayload only)
 └─▶ (runtime contracts — canonical response is runtime-consumable)

transport ⇏ provider SDKs / HTTP / gRPC / MongoDB / Redis / BullMQ / business
```

## 7. Why the "local" client is functional (not a provider)

To let the pipeline be exercised without networking, the platform ships a
`LocalTransportClient` — an in-process, provider-independent transport whose default
handler echoes the request body. It is **not** a provider implementation; it is the
"Local Runtime" protocol named in the milestone. Every other protocol ships as a
placeholder returning `NOT_IMPLEMENTED`, reserved for later milestones.
