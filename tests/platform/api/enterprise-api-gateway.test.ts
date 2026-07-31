import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { API_ROUTE_MAP } from "../../../src/platform/api/routes/route-map";
import { hasPermission, permissionsForRoles } from "../../../src/platform/api/authorization/rbac";
import { InMemoryRateLimitService } from "../../../src/platform/api/rate-limits/in-memory-rate-limit-service";
import { InMemoryStreamingService } from "../../../src/platform/api/streaming/in-memory-streaming-service";
import { validateApiRequest } from "../../../src/platform/api/validation/validate-request";
import { listCatalogProviderIds } from "../../../src/platform/intelligence/provider-catalog/catalog/provider-catalog-seed";

describe("Enterprise API Gateway", () => {
  it("exposes v1 and v2 route contracts", () => {
    const { gateway } = setupEnterpriseApi();
    const all = gateway.listRoutes();
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.length).toBe(API_ROUTE_MAP.length);
    expect(all.value.some((r) => r.version === "v1")).toBe(true);
    expect(all.value.some((r) => r.version === "v2")).toBe(true);
    const v1 = gateway.listRoutes("v1");
    expect(v1.ok && v1.value.every((r) => r.path.startsWith("/v1/"))).toBe(true);
  });

  it("authenticates with JWT and rejects missing auth", async () => {
    const platform = setupEnterpriseApi();
    const denied = await platform.gateway.handle(
      apiRequest({ method: "GET", path: "/v1/capabilities" })
    );
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.value.status).toBe(401);

    const { token } = await loginDemo(platform);
    const ok = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/capabilities",
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(ok.ok && ok.value.status).toBe(200);
  });

  it("supports API key authentication", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const issued = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/auth/api-keys",
        headers: { authorization: `Bearer ${token}` },
        body: { name: "ci", roles: ["service"], organizationId },
      })
    );
    expect(issued.ok && issued.value.status).toBe(201);
    if (!issued.ok) return;
    const apiKey = (issued.value.body as { data: { apiKey: string } }).data.apiKey;
    const res = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/providers",
        headers: { "x-api-key": apiKey },
      })
    );
    expect(res.ok && res.value.status).toBe(200);
    if (!res.ok) return;
    const providers = (res.value.body as { data: { providerId: string }[] }).data;
    expect(providers.length).toBe(listCatalogProviderIds().length);
  });

  it("enforces RBAC", () => {
    const viewer = permissionsForRoles(["viewer"]);
    expect(hasPermission(viewer, ["execution:read"])).toBe(true);
    expect(hasPermission(viewer, ["execution:create"])).toBe(false);
    expect(hasPermission(permissionsForRoles(["owner"]), ["execution:create"])).toBe(true);
  });

  it("isolates tenants on execution access", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: { prompt: "Launch a campaign", organizationId },
      })
    );
    expect(created.ok && created.value.status).toBe(201);
    if (!created.ok) return;
    const executionId = (created.value.body as { data: { executionId: string } }).data
      .executionId;

    const otherOrg = platform.tenants.createOrganization("Other");
    expect(otherOrg.ok).toBe(true);
    if (!otherOrg.ok) return;
    platform.auth.seedUser({
      email: "other@x.com",
      password: "x",
      userId: "usr_other",
      organizationId: otherOrg.value.organizationId,
      roles: ["admin"],
    });
    const otherLogin = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/auth/login",
        body: {
          email: "other@x.com",
          password: "x",
          organizationId: otherOrg.value.organizationId,
          deviceId: "d2",
        },
      })
    );
    expect(otherLogin.ok && otherLogin.value.status).toBe(201);
    if (!otherLogin.ok) return;
    const otherToken = (otherLogin.value.body as { data: { accessToken: string } }).data
      .accessToken;

    const sneak = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      })
    );
    expect(sneak.ok && sneak.value.status).toBe(403);
  });

  it("creates execution and returns artifacts/diagnostics/trace/cost/eval", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Write a product brief",
          organizationId,
          stream: true,
        },
      })
    );
    expect(created.ok && created.value.status).toBe(201);
    if (!created.ok) return;
    const exec = (created.value.body as { data: { executionId: string; status: string } })
      .data;
    expect(exec.executionId).toBeTruthy();
    expect(["succeeded", "queued", "running", "failed"]).toContain(exec.status);

    const id = exec.executionId;
    for (const suffix of [
      "",
      "/artifacts",
      "/diagnostics",
      "/trace",
      "/cost",
      "/evaluation",
      "/experience",
    ]) {
      const res = await platform.gateway.handle(
        apiRequest({
          method: "GET",
          path: `/v1/executions/${id}${suffix}`,
          headers: { authorization: `Bearer ${token}` },
        })
      );
      expect(res.ok && res.value.status).toBe(200);
    }
  });

  it("streams execution via SSE frames", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: { prompt: "stream me", organizationId },
      })
    );
    if (!created.ok) return;
    const id = (created.value.body as { data: { executionId: string } }).data.executionId;
    const stream = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${id}/stream`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(stream.ok && stream.value.status).toBe(200);
    if (!stream.ok) return;
    const frames = (stream.value.body as { data: { event: string; data: string }[] }).data;
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.event === "done" || f.event === "status")).toBe(true);
  });

  it("rate limits aggressive callers", async () => {
    const rl = new InMemoryRateLimitService(
      () => "t",
      () => 1000,
      [{ dimension: "user", limit: 2, windowMs: 60_000 }]
    );
    const a = await rl.check({ userId: "u1" });
    const b = await rl.check({ userId: "u1" });
    const c = await rl.check({ userId: "u1" });
    expect(a.ok && a.value.allowed).toBe(true);
    expect(b.ok && b.value.allowed).toBe(true);
    expect(c.ok && c.value.allowed).toBe(false);
  });

  it("validates versioned paths", () => {
    const bad = validateApiRequest(
      apiRequest({ method: "GET", path: "/v9/health", version: "v1" })
    );
    expect(bad.ok).toBe(false);
    const good = validateApiRequest(
      apiRequest({ method: "GET", path: "/v1/health", version: "v1" })
    );
    expect(good.ok).toBe(true);
  });

  it("supports websocket stream abstraction without provider specifics", () => {
    const streaming = new InMemoryStreamingService(
      () => "2026-07-15T00:00:00.000Z",
      (p) => `${p}_1`
    );
    const sub = streaming.subscribe("exec_1", "websocket");
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    const pushed = streaming.push({
      subscriptionId: sub.value.subscriptionId,
      executionId: "exec_1",
      kind: "progress",
      payload: { percent: 50 },
    });
    expect(pushed.ok).toBe(true);
  });

  it("health is public and declares gateway as only entry point", async () => {
    const { gateway } = setupEnterpriseApi();
    const res = await gateway.handle(apiRequest({ method: "GET", path: "/v1/health" }));
    expect(res.ok && res.value.status).toBe(200);
    if (!res.ok) return;
    const data = (res.value.body as { data: { onlyEntryPoint: boolean } }).data;
    expect(data.onlyEntryPoint).toBe(true);
  });
});
