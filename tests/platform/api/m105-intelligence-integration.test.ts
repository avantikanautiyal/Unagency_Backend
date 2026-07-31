/**
 * M10.5 — Intelligence feature integration (credential-free).
 * Frontend → POST /v1/executions → Capability/Model/Routing → ControllableDispatcher.
 */

import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { bootstrapEnterpriseApiRuntime, resetEnterpriseApiRuntimeForTests } from "../../../src/platform/api/runtime";
import { listIntelligenceCapabilities } from "../../../src/platform/api/services/intelligence-capabilities-service";

describe("M10.5 intelligence capabilities truth", () => {
  it("lists inventory capabilities as available under simulated mode", () => {
    const caps = listIntelligenceCapabilities("simulated");
    expect(caps.length).toBe(9);
    const text = caps.find((c) => c.capabilityId === "text.generate");
    expect(text?.available).toBe(true);
    expect(text?.supportsStreaming).toBe(true);
  });

  it("marks capabilities unavailable under stub mode", () => {
    const caps = listIntelligenceCapabilities("stub");
    expect(caps.every((c) => c.available === false)).toBe(true);
  });

  it("GET /v1/intelligence/capabilities returns runtime truth via gateway", async () => {
    resetEnterpriseApiRuntimeForTests();
    bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const platform = setupEnterpriseApi({ executionMode: "simulated" });
    // Bind runtime for dispatch readiness path
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token } = await loginDemo(runtime.platform);
    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/intelligence/capabilities",
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe(200);
    const body = res.value.body as { data: { capabilityId: string; available: boolean }[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((c) => c.capabilityId === "text.generate" && c.available)).toBe(
      true
    );
    void platform;
  });
});

describe("M10.5 simulated text execution E2E", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("POST /v1/executions text.generate returns presentation result text", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Launch iced coffee for Gen Z summer.",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBeLessThan(400);
    const body = res.value.body as {
      data: {
        executionId: string;
        status: string;
        capabilityId?: string;
        result?: { kind: string; text?: string };
      };
    };
    expect(body.data.status).toBe("succeeded");
    expect(body.data.capabilityId).toBe("text.generate");
    expect(body.data.result?.kind).toBe("text");
    expect(body.data.result?.text).toMatch(/Simulated creative copy/);
    expect(body.data.result?.text).toMatch(/iced coffee/i);
  }, 120000);

  it("rejects cross-tenant organizationId on create", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token } = await loginDemo(runtime.platform);
    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "x",
          capabilityId: "text.generate",
          organizationId: "org_other_tenant",
        },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe(403);
  });

  it("unauthenticated create returns 401", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        body: {
          prompt: "x",
          capabilityId: "text.generate",
          organizationId: runtime.platform.seed!.organizationId,
        },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe(401);
  });
});
