/**
 * HTTP integration tests — Express transport → ApiGatewayEngine.
 */

import request from "supertest";
import * as enterpriseFactory from "../../src/platform/api/factories/create-enterprise-api-platform";
import {
  getEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../src/platform/api/runtime";

describe("Express Enterprise API transport (HTTP)", () => {
  let app: typeof import("../../src/app").default;

  beforeAll(async () => {
    resetEnterpriseApiRuntimeForTests();
    jest.spyOn(enterpriseFactory, "createEnterpriseApiPlatform");
    const mod = await import("../../src/app");
    app = mod.default;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("creates the Enterprise API platform once at startup", () => {
    expect(enterpriseFactory.createEnterpriseApiPlatform).toHaveBeenCalledTimes(1);
    expect(getEnterpriseApiRuntime()).toBeDefined();
  });

  it("legacy GET / still works and is not intercepted by the platform adapter", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Hello World",
    });
  });

  it("GET /v1/health reaches ApiGatewayEngine through Express", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "healthy",
      gateway: "enterprise-api",
      onlyEntryPoint: true,
    });
    expect(res.headers["x-api-version"]).toBe("v1");
    expect(res.headers["x-platform"]).toBe("unagency-enterprise-api");
  });

  it("returns platform 404 for unknown /v1 routes", async () => {
    const res = await request(app).get("/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects protected /v1 endpoints without credentials", async () => {
    const res = await request(app).get("/v1/capabilities");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHORIZATION_ERROR");
  });

  it("accepts valid platform credentials on protected endpoints", async () => {
    const runtime = getEnterpriseApiRuntime();
    expect(runtime?.platform.seed).toBeDefined();

    const login = await request(app)
      .post("/v1/auth/login")
      .send({
        email: "admin@unagency.local",
        password: "admin",
        organizationId: runtime!.platform.seed!.organizationId,
        deviceId: "http_test_device",
      });

    expect(login.status).toBe(201);
    const token = login.body.data.accessToken as string;
    expect(token).toMatch(/^jwt_/);

    const res = await request(app)
      .get("/v1/capabilities")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("preserves query parameters through request translation", async () => {
    const runtime = getEnterpriseApiRuntime();
    const login = await request(app)
      .post("/v1/auth/login")
      .send({
        email: "admin@unagency.local",
        password: "admin",
        organizationId: runtime!.platform.seed!.organizationId,
        deviceId: "http_test_device",
      });
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .get("/v1/workspaces")
      .query({ organizationId: runtime!.platform.seed!.organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("preserves JSON request bodies through request translation", async () => {
    const runtime = getEnterpriseApiRuntime();
    const login = await request(app)
      .post("/v1/auth/login")
      .send({
        email: "admin@unagency.local",
        password: "admin",
        organizationId: runtime!.platform.seed!.organizationId,
        deviceId: "http_test_device",
      });
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "HTTP integration test prompt",
        organizationId: runtime!.platform.seed!.organizationId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.executionId).toBeTruthy();
    expect(res.body.data.status).toBeTruthy();
  });

  it("preserves gateway response status codes through response translation", async () => {
    const runtime = getEnterpriseApiRuntime();
    const login = await request(app)
      .post("/v1/auth/login")
      .send({
        email: "admin@unagency.local",
        password: "admin",
        organizationId: runtime!.platform.seed!.organizationId,
        deviceId: "http_test_device",
      });
    const token = login.body.data.accessToken as string;

    const created = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "status code test",
        organizationId: runtime!.platform.seed!.organizationId,
      });
    expect(created.status).toBe(201);

    const denied = await request(app).get("/v1/capabilities");
    expect(denied.status).toBe(401);
  });

  it("preserves gateway response headers through response translation", async () => {
    const res = await request(app)
      .get("/v1/health")
      .set("x-request-id", "req_http_test_123");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe("req_http_test_123");
    expect(res.headers["x-api-version"]).toBe("v1");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("supports parameterised /v1 routes", async () => {
    const runtime = getEnterpriseApiRuntime();
    const login = await request(app)
      .post("/v1/auth/login")
      .send({
        email: "admin@unagency.local",
        password: "admin",
        organizationId: runtime!.platform.seed!.organizationId,
        deviceId: "http_test_device",
      });
    const token = login.body.data.accessToken as string;

    const created = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "parameterised route test",
        organizationId: runtime!.platform.seed!.organizationId,
      });
    const executionId = created.body.data.executionId as string;

    const res = await request(app)
      .get(`/v1/executions/${executionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.executionId).toBe(executionId);
  });

  it("does not intercept legacy /auth routes", async () => {
    const res = await request(app).post("/auth/register").send({});
    expect(res.status).not.toBe(404);
    expect(res.body?.error?.code).not.toBe("NOT_FOUND");
  });

  it("exposes stub execution mode on the runtime singleton", () => {
    const runtime = getEnterpriseApiRuntime();
    expect(runtime?.executionMode).toBe("stub");
  });
});
