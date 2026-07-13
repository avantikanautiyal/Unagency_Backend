import { InMemoryTransportClientRegistry } from "../../../../../src/platform/intelligence/providers/transport/clients/client-registry";
import {
  LocalTransportClient,
  defaultEchoHandler,
} from "../../../../../src/platform/intelligence/providers/transport/clients/local-transport-client";
import { HttpTransportClientPlaceholder } from "../../../../../src/platform/intelligence/providers/transport/clients/placeholder-clients";
import { asTransportSessionId } from "../../../../../src/platform/intelligence/providers/transport/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";
import type { TransportContext } from "../../../../../src/platform/intelligence/providers/transport/contracts/context";
import type { TransportRequest } from "../../../../../src/platform/intelligence/providers/transport/contracts/transport-io";

const context: TransportContext = {
  requestId: "req_1",
  providerId: asProviderId("provider.test"),
  protocol: "local",
  attributes: {},
  startedAt: "2026-01-01T00:00:00.000Z",
};

const request: TransportRequest = {
  sessionId: asTransportSessionId("sess_1"),
  requestId: "req_1",
  protocol: "local",
  operation: "invoke",
  body: { hello: "world" },
  headers: {},
  streaming: false,
  timeoutMs: 1000,
  compression: "none",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Transport client registry", () => {
  it("registers and resolves clients by protocol", () => {
    const registry = new InMemoryTransportClientRegistry();
    expect(registry.register(new LocalTransportClient()).ok).toBe(true);
    expect(registry.has("local")).toBe(true);
    expect(registry.resolve("local").ok).toBe(true);
    expect(registry.list()).toContain("local");
  });

  it("rejects duplicate registration and unknown resolution", () => {
    const registry = new InMemoryTransportClientRegistry();
    registry.register(new LocalTransportClient());
    expect(registry.register(new LocalTransportClient()).ok).toBe(false);
    expect(registry.resolve("grpc").ok).toBe(false);
  });
});

describe("Local + placeholder transport clients", () => {
  it("local client echoes the request body (no networking)", async () => {
    const client = new LocalTransportClient(defaultEchoHandler);
    const result = await client.send(request, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toEqual({ hello: "world" });
    expect(client.capability().protocol).toBe("local");
  });

  it("placeholder client is not implemented", async () => {
    const client = new HttpTransportClientPlaceholder();
    const result = await client.send(request, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_IMPLEMENTED");
    }
    expect(client.health().ok).toBe(true);
  });
});
