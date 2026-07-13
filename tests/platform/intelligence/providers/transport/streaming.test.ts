import { DefaultTransportStreamingEngine } from "../../../../../src/platform/intelligence/providers/transport/streaming/default-streaming-engine";
import { asTransportSessionId } from "../../../../../src/platform/intelligence/providers/transport/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";
import type { TransportSession } from "../../../../../src/platform/intelligence/providers/transport/contracts/session-connection";

const session: TransportSession = {
  sessionId: asTransportSessionId("sess_stream"),
  requestId: "req_1",
  providerId: asProviderId("provider.test"),
  protocol: "sse",
  state: "streaming",
  openedAt: "2026-01-01T00:00:00.000Z",
};

describe("Transport streaming engine", () => {
  const engine = new DefaultTransportStreamingEngine(() => "2026-01-01T00:00:00.000Z");

  it("normalizes a delta chunk", () => {
    const result = engine.normalizeChunk({ content: "hi" }, session, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("chunk");
    expect(result.value.done).toBe(false);
    expect(result.value.data.content).toBe("hi");
  });

  it("normalizes a terminal chunk as an end marker", () => {
    const result = engine.normalizeChunk({ done: true }, session, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("end");
    expect(result.value.done).toBe(true);
  });

  it("emits heartbeat, completion, and cancellation markers", () => {
    const heartbeat = engine.heartbeat(session, 1);
    const complete = engine.complete(session, 2);
    const cancel = engine.cancel(session, 3);

    expect(heartbeat.ok && heartbeat.value.kind).toBe("heartbeat");
    expect(complete.ok && complete.value.done).toBe(true);
    expect(cancel.ok && cancel.value.done).toBe(true);
  });
});
