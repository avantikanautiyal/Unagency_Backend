import { resolveGatewayPath, toApiRequest } from "../../src/platform/api/transports/express/express-request-adapter";

describe("express-request-adapter", () => {
  it("reconstructs /v1 paths when mounted under /v1", () => {
    const req = {
      method: "GET",
      originalUrl: "/v1/health",
      baseUrl: "/v1",
      path: "/health",
      headers: {},
      query: {},
      body: undefined,
    } as Parameters<typeof toApiRequest>[0];

    expect(resolveGatewayPath(req)).toBe("/v1/health");

    const apiRequest = toApiRequest(req);
    expect(apiRequest?.path).toBe("/v1/health");
    expect(apiRequest?.version).toBe("v1");
  });
});
