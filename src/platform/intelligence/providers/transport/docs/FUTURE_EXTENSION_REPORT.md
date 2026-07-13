# M4.5 Transport Platform — Future Extension Report

The transport platform is designed so that **every future capability is additive** —
no adapter, negotiation, or runtime module needs to change.

## 1. Adding a real protocol client (HTTP / SDK / gRPC / WS / SSE / MCP)

1. Implement `ITransportClient` (e.g. `OpenAiHttpTransportClient` in a *provider*
   milestone, or a generic `HttpTransportClient` in a transport-implementation
   milestone).
2. Register it for its protocol in the `ITransportClientRegistry`, replacing the
   placeholder.
3. Adapters are unchanged — they still call `engine.execute(canonicalRequest)`.

```ts
class HttpTransportClient implements IHttpTransportClient {
  readonly protocol = "https";
  capability() { return capabilityForProtocol("https"); }
  async send(req, ctx) { /* real fetch/undici here — future milestone */ }
  health() { /* real probe */ }
}
registry.register(new HttpTransportClient());
```

## 2. Custom serialization (protobuf, MessagePack)

Implement `ITransportSerializer` / `ITransportDeserializer` and inject them into the
pipeline. The canonical/opaque boundary is unaffected.

## 3. Distributed connection pooling

Implement `IConnectionPool` (and optionally `IConnectionManager`) backed by a shared
store. `TransportPool` / `TransportConnection` contracts already carry the needed
identity and state fields.

## 4. Real compression

Replace `IdentityCompressor` with a codec-backed `ICompressor`. `CompressionMiddleware`
already sets the `content-encoding` header and records byte deltas.

## 5. Streaming transports

`ITransportStreamingEngine` already normalizes chunks and lifecycle markers.
A future streaming pipeline variant can reuse it while a WebSocket/SSE client
supplies the raw frames.

## 6. Observability integrations

- Swap `NoopTransportEventPublisher` → `EventBusTransportEventPublisher`.
- Replace `TracingMiddleware` / `LoggingMiddleware` with OpenTelemetry-backed
  implementations.
- `ITransportDiagnostics` can be extended with percentile latency without changing
  the interface consumers.

## 7. New protocols (MCP, enterprise gateway)

The `TransportProtocol` union and protocol catalog already include `mcp` and
`enterprise_gateway`. Adding a client is the only work required.

## 8. What will never need to change

- `CanonicalProviderRequest` / `CanonicalProviderResponse` (the adapter boundary).
- `IProviderTransportEngine` (the single public entry point).
- Any negotiation / adapter / runtime module.
