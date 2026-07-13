# Provider Transport Platform (M4.5)

A **provider-independent transport layer**. Its only job is to deliver a
`CanonicalProviderRequest` and return a `CanonicalProviderResponse`. It hides the
communication mechanism (HTTP / SDK / gRPC / WebSocket / SSE / local / MCP) behind
a single engine.

> No networking. No provider SDKs. No HTTP implementation. No persistence.
> No concrete providers (OpenAI/Anthropic/Gemini/...).

## Objective

```
CanonicalProviderRequest
  → Transport Pipeline
    → Transport Client
      → Transport Protocol
        → (future) SDK / HTTP / gRPC
  → CanonicalProviderResponse
```

## Quick start

```ts
import { createTransportPlatform, CanonicalProviderRequestBuilder }
  from ".../providers/transport";
import { asProviderId } from ".../shared/identifiers";

const { engine } = createTransportPlatform();

const request = CanonicalProviderRequestBuilder.create()
  .withRequestId("req_1")
  .withProviderId(asProviderId("provider.acme"))
  .withProtocol("local")             // "http" | "sdk" | "grpc" | ... (placeholders)
  .withOperation("chat.completions")
  .withPayload({ model: "m", prompt: "hi" })
  .build();

const result = await engine.execute(request);
// result.value.success, result.value.response?.payload, result.value.statistics
```

## What a future adapter sees

A provider adapter (M4.4) builds an opaque `ProviderWirePayload`, wraps it in a
`CanonicalProviderRequest`, and calls `engine.execute()`. It never knows whether the
bytes travelled over HTTP, an SDK, gRPC, or an in-process worker.

## Pipeline stages

`Validate → Open Session → Serialize → Execute → Deserialize → Normalize → Close Session`

## Guarantees

- **Interfaces everywhere**, constructor injection, `Result<T>`, immutable contracts.
- **Provider-independent**: only opaque payloads cross the boundary.
- **Extensible**: register a new `ITransportClient` for a protocol — adapters are unchanged.
- **In-memory only**: connections and pools are logical; no sockets.

See [`docs/`](./docs) for the full architecture review, diagrams, reports, and ACPs.
