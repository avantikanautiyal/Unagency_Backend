# Streaming Model

Provider-agnostic. No OpenAI/Anthropic stream types on the wire.

## M9.5O update

Production-grade streaming uses:

- `ProviderStreamEvent` (canonical)
- `INativeStreamingDispatcher` (native incremental only)
- `StreamingExecutionOrchestrator` (commit-boundary failover)
- `ApiResponse.sse` → Express `text/event-stream`

See `docs/M9.5O_STREAMING_RUNTIME.md`.

Buffered leaf `dispatchStreaming` that emits one synthetic done chunk is **not** native streaming.

## Transports

| Transport | Usage |
|-----------|--------|
| `sse` | Server-Sent Events (`event` / `id` / `data`) — preferred for text/tool lifecycle |
| `websocket` | Deferred (realtime); not required for one-way streaming |
| `chunked` | Abstraction for binary audio (future) |

## Events (API)

`execution.started` · `content.delta` · `reasoning.delta` · `tool_call.*` · `usage.final` · `execution.completed` · `execution.failed` · `execution.cancelled`

## Legacy poll API

`GET /v1/executions/:id/stream` historically returned SSE frames inside a JSON envelope. Prefer live SSE via `ApiResponse.sse` for true incremental delivery.
