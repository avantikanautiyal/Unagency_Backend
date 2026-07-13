import { DefaultTransportSerializer } from "../../../../../src/platform/intelligence/providers/transport/serializers/default-serializer";
import { DefaultTransportDeserializer } from "../../../../../src/platform/intelligence/providers/transport/deserializers/default-deserializer";
import { makeCanonicalRequest } from "../../../../../src/platform/intelligence/providers/transport/testing";
import { asTransportSessionId } from "../../../../../src/platform/intelligence/providers/transport/contracts/identifiers";
import type { TransportSession } from "../../../../../src/platform/intelligence/providers/transport/contracts/session-connection";
import type { TransportResponse } from "../../../../../src/platform/intelligence/providers/transport/contracts/transport-io";

const session: TransportSession = {
  sessionId: asTransportSessionId("sess_1"),
  requestId: "req_test_1",
  providerId: makeCanonicalRequest().providerId,
  protocol: "local",
  state: "open",
  openedAt: "2026-01-01T00:00:00.000Z",
};

describe("Transport serialization", () => {
  it("serializes a canonical request into a protocol request (opaque body)", () => {
    const serializer = new DefaultTransportSerializer(() => "2026-01-01T00:00:00.000Z");
    const request = makeCanonicalRequest({
      operation: "chat.completions",
      payload: { model: "x", prompt: "hi" },
    });

    const result = serializer.serialize(request, session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operation).toBe("chat.completions");
    expect(result.value.sessionId).toBe(session.sessionId);
    expect(result.value.body).toEqual({ model: "x", prompt: "hi" });
  });

  it("deserializes a protocol response into a canonical response", () => {
    const deserializer = new DefaultTransportDeserializer(() => "2026-01-01T00:00:00.000Z");
    const request = makeCanonicalRequest();
    const response: TransportResponse = {
      sessionId: session.sessionId,
      requestId: request.requestId,
      protocol: "local",
      body: { text: "world" },
      headers: {},
      statusHint: 200,
      streamed: false,
      receivedAt: "2026-01-01T00:00:00.000Z",
    };

    const result = deserializer.deserialize(response, request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.payload.text).toBe("world");
  });

  it("marks 4xx/5xx status hints as unsuccessful", () => {
    const deserializer = new DefaultTransportDeserializer();
    const request = makeCanonicalRequest();
    const response: TransportResponse = {
      sessionId: session.sessionId,
      requestId: request.requestId,
      protocol: "local",
      body: "boom",
      headers: {},
      statusHint: 500,
      streamed: false,
      receivedAt: "2026-01-01T00:00:00.000Z",
    };

    const result = deserializer.deserialize(response, request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.payload.raw).toBe("boom");
  });
});
