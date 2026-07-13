import { composeMiddleware } from "../../../../../src/platform/intelligence/providers/transport/middleware/compose";
import {
  RequestMutationMiddleware,
  ResponseMutationMiddleware,
} from "../../../../../src/platform/intelligence/providers/transport/middleware/built-in";
import {
  makeCanonicalRequest,
  setupTransportPlatform,
} from "../../../../../src/platform/intelligence/providers/transport/testing";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";
import { success } from "../../../../../src/platform/intelligence/shared/result";
import { asTransportSessionId } from "../../../../../src/platform/intelligence/providers/transport/contracts/identifiers";
import type { TransportContext } from "../../../../../src/platform/intelligence/providers/transport/contracts/context";
import type {
  TransportRequest,
  TransportResponse,
} from "../../../../../src/platform/intelligence/providers/transport/contracts/transport-io";

const context: TransportContext = {
  requestId: "req_1",
  providerId: asProviderId("provider.test"),
  protocol: "local",
  attributes: {},
  startedAt: "2026-01-01T00:00:00.000Z",
};

const baseRequest: TransportRequest = {
  sessionId: asTransportSessionId("sess_1"),
  requestId: "req_1",
  protocol: "local",
  operation: "invoke",
  body: { a: 1 },
  headers: {},
  streaming: false,
  timeoutMs: 1000,
  compression: "none",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Transport middleware", () => {
  it("mutates the request and response through the onion", async () => {
    const middlewares = [
      new RequestMutationMiddleware((req) => ({
        ...req,
        headers: { ...req.headers, "x-trace": "on" },
      })),
      new ResponseMutationMiddleware((res) => ({
        ...res,
        headers: { ...res.headers, "x-processed": "yes" },
      })),
    ];

    const terminal = async (req: TransportRequest) => {
      expect(req.headers["x-trace"]).toBe("on");
      const response: TransportResponse = {
        sessionId: req.sessionId,
        requestId: req.requestId,
        protocol: req.protocol,
        body: req.body,
        headers: {},
        statusHint: 200,
        streamed: false,
        receivedAt: "2026-01-01T00:00:00.000Z",
      };
      return success(response);
    };

    const chain = composeMiddleware(middlewares, context, terminal);
    const result = await chain(baseRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headers["x-processed"]).toBe("yes");
  });

  it("records metrics + serialization stats through the default chain", async () => {
    const { engine, diagnostics } = setupTransportPlatform();
    await engine.execute(makeCanonicalRequest());

    expect(diagnostics.serializationStatistics().serializations).toBeGreaterThan(0);
    expect(diagnostics.latency("local").samples).toBeGreaterThan(0);
  });
});
