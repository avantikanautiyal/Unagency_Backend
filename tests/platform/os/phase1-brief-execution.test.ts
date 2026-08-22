/**
 * Phase 1 — Brief Intelligence on production execution path + tenant isolation.
 */

import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import type { StructuredBrief } from "../../../src/platform/os/brief";

describe("Phase 1 — Brief → execution path", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("POST /v1/executions runs Brief Intelligence and persists StructuredBrief", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const prompt =
      "Create a product launch campaign with Instagram content and a landing page.";

    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt,
          organizationId,
          workspaceId: runtime.platform.seed!.workspaceId,
        },
      })
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([200, 201]).toContain(res.value.status);
    const body = res.value.body as {
      data: { executionId: string; organizationId: string; status: string };
    };
    expect(body.data.organizationId).toBe(organizationId);
    expect(["succeeded", "queued", "running"]).toContain(body.data.status);

    const briefResult = await runtime.platform.executions.getBrief(
      body.data.executionId,
      { organizationId } as never
    );
    expect(briefResult.ok).toBe(true);
    if (!briefResult.ok) return;

    const brief = briefResult.value as StructuredBrief;
    expect(brief.executionId).toBe(body.data.executionId);
    expect(brief.organizationId).toBe(organizationId);
    expect(brief.intent.kind).toBe("campaign");
    expect(brief.deliverables.map((d) => d.type)).toEqual(
      expect.arrayContaining(["campaign_strategy", "instagram_content", "landing_page"])
    );
    expect(brief.requiredCapabilities.some((c) => c.capabilityId === "text.generate")).toBe(
      true
    );
    expect(brief.status).toBe("VALID");
  });

  it("legacy clients with capabilityId still work and receive a brief", async () => {
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
    const executionId = (res.value.body as { data: { executionId: string } }).data
      .executionId;
    const brief = await runtime.platform.executions.getBrief(executionId, {
      organizationId,
    } as never);
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.value.sourceRequest.clientCapabilityId).toBe("text.generate");
  });

  it("blocks thin website requests with BRIEF_NEEDS_INFORMATION when no capabilityId", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const seed = runtime.platform.seed!;
    const created = await runtime.platform.executions.create(
      {
        prompt: "Build me a website.",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
      },
      {
        userId: seed.userId,
        organizationId: seed.organizationId,
        roles: ["owner"],
        email: seed.email,
      } as never
    );
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.message).toMatch(/BRIEF_NEEDS_INFORMATION/);
  });

  it("tenant B cannot retrieve tenant A brief", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const seed = runtime.platform.seed!;
    const orgA = seed.organizationId;
    const orgB = runtime.platform.tenants.createOrganization("Other Org Phase1");
    expect(orgB.ok).toBe(true);
    if (!orgB.ok) return;

    const created = await runtime.platform.executions.create(
      {
        prompt:
          "Create a product launch campaign with Instagram content and a landing page.",
        capabilityId: "text.generate",
        organizationId: orgA,
        workspaceId: seed.workspaceId,
      },
      {
        userId: seed.userId,
        organizationId: orgA,
        roles: ["owner"],
        email: seed.email,
      } as never
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cross = await runtime.platform.executions.getBrief(created.value.executionId, {
      organizationId: orgB.value.organizationId,
    } as never);
    expect(cross.ok).toBe(false);
  });

  it("Integration metadata carries briefPrimaryCapability for capability-hint path", async () => {
    void setupEnterpriseApi;
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const seed = runtime.platform.seed!;
    const created = await runtime.platform.executions.create(
      {
        prompt:
          "Create a product launch campaign with Instagram content and a landing page.",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
      },
      {
        userId: seed.userId,
        organizationId: seed.organizationId,
        roles: ["owner"],
        email: seed.email,
      } as never
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const brief = await runtime.platform.executions.getBrief(created.value.executionId, {
      organizationId: seed.organizationId,
    } as never);
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.value.requiredCapabilities[0]?.capabilityId).toBe("text.generate");
    expect(created.value.capabilityId).toBe("text.generate");
  });
});
