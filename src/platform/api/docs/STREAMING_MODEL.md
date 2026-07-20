# Streaming Model

Provider-agnostic. No OpenAI/Anthropic stream types on the wire.

## Transports

| Transport | Usage |
|-----------|--------|
| `sse` | Server-Sent Events frames (`event` / `id` / `data`) |
| `websocket` | Same event model, different delivery channel |
| `chunked` | Chunked HTTP abstraction |

## Events

`progress` · `status` · `chunk` · `artifact` · `error` · `done`

API: `GET /v{1|2}/executions/:id/stream` returns SSE frames inside the stable JSON envelope for SDK portability.
