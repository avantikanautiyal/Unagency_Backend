# M4.5 Transport Platform — ACP Report

No **blocking** issues were found. The transport platform is implemented within all
milestone rules (interfaces, DI, immutable contracts, builder, `Result<T>`, no
networking/SDKs/HTTP/persistence, no concrete providers, no frozen-module edits).

The following **non-blocking** Architecture Change Proposals are recorded for future
consideration. None require changes to frozen modules or public contracts now.

---

## ACP-T1 — Streaming execution path on the engine (LOW)

- **Problem:** `IProviderTransportEngine.execute()` returns a single
  `CanonicalProviderResponse`. Streaming is modelled by `StreamingTransportChunk` +
  `ITransportStreamingEngine`, but there is no first-class `executeStream()` entry
  point on the engine yet (deferred until a streaming-capable client exists).
- **Impact:** Streaming consumers must drive the streaming engine directly.
- **Proposed solution:** Add `executeStream(request): AsyncIterable<StreamingTransportChunk>`
  to the engine when the first streaming client (WebSocket/SSE) lands.
- **Affected modules:** `transport/engine`, `transport/interfaces`.
- **Migration:** Purely additive method; no contract change.
- **Priority:** Low.

## ACP-T2 — Shared transport ⇄ runtime error taxonomy (LOW)

- **Problem:** `TransportError.kind` and the runtime/adapter error kinds are mapped
  by a local table in the engine. Over time these taxonomies could drift.
- **Impact:** Minor duplication of error-classification logic across provider modules.
- **Proposed solution:** Introduce a shared canonical error-kind mapping utility in
  `shared/errors` that transport, adapter, and runtime all consume.
- **Affected modules:** `shared/errors` (new util), `transport`, `adapters`, `runtime`.
- **Migration:** Additive utility; adopt incrementally.
- **Priority:** Low.

## ACP-T3 — Pipeline stage ordering vs. serializer session dependency (INFORMATIONAL)

- **Problem:** The milestone lists `Serialize` before `Open Session`, but the
  serializer needs a `sessionId`. The implementation opens the session first, then
  serializes (functionally correct dependency order).
- **Impact:** None functionally; a cosmetic difference from the listed order.
- **Proposed solution:** If strict textual ordering is desired, split "session id
  allocation" from "connection acquisition" so a request can be serialized before a
  connection is acquired.
- **Affected modules:** `transport/pipeline`.
- **Migration:** Internal reordering only; no contract change.
- **Priority:** Informational.

---

**Recommendation:** Proceed. The Provider Transport Platform (M4.5) is ready to be
frozen. Future provider adapters can communicate exclusively through
`IProviderTransportEngine`, and later milestones can plug in HTTP/SDK/gRPC/SSE/
WebSocket/MCP clients without modifying adapters.
