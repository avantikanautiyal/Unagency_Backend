/**
 * M10.6 — Simulated async image/video execution + artifact media (credential-free).
 */

import {
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

async function pollUntilTerminal(
  gateway: {
    handle: (req: ReturnType<typeof apiRequest>) => Promise<{
      ok: boolean;
      value?: { body?: unknown; status?: number };
    }>;
  },
  token: string,
  executionId: string,
  maxPolls = 12
) {
  let last: Record<string, unknown> | undefined;
  for (let i = 0; i < maxPolls; i++) {
    const res = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return last;
    last = (res.value?.body as { data: Record<string, unknown> }).data;
    const status = String(last?.status ?? "");
    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      return last;
    }
  }
  return last;
}

describe("M10.6 simulated async image E2E", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("image.generate → waiting_provider → artifact → media data URL", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    expect(runtime.platform.durableStores?.asyncMedia).toBeDefined();

    const { token, organizationId } = await loginDemo(runtime.platform);
    const created = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "A chilled coffee poster",
          capabilityId: "image.generate",
          organizationId,
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const body = (created.value.body as { data: Record<string, unknown> }).data;
    expect(body.status).toBe("waiting_provider");
    expect((body.result as { kind?: string })?.kind).toBe("pending");

    const terminal = await pollUntilTerminal(
      runtime.platform.gateway,
      token,
      String(body.executionId)
    );
    expect(terminal?.status).toBe("succeeded");
    expect((terminal?.result as { kind?: string })?.kind).toBe("artifact");
    const artifactIds = terminal?.artifactIds as string[] | undefined;
    expect(Array.isArray(artifactIds) && artifactIds.length).toBeGreaterThan(0);

    const arts = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${body.executionId}/artifacts`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(arts.ok).toBe(true);
    if (!arts.ok) return;
    const list = (arts.value.body as { data: { artifactId: string }[] }).data;
    expect(list.length).toBeGreaterThan(0);

    const media = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/artifacts/${list[0]!.artifactId}/media`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(media.ok).toBe(true);
    if (!media.ok) return;
    const mediaBody = (
      media.value.body as {
        data: { signedUrl: string; expiresInSeconds: number };
      }
    ).data;
    expect(mediaBody.signedUrl.startsWith("data:")).toBe(true);
    expect(mediaBody.expiresInSeconds).toBeGreaterThan(0);
  }, 60000);

  it("blocks cross-tenant artifact media", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const created = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "poster",
          capabilityId: "image.generate",
          organizationId,
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const executionId = String(
      (created.value.body as { data: { executionId: string } }).data.executionId
    );
    const terminal = await pollUntilTerminal(
      runtime.platform.gateway,
      token,
      executionId
    );
    const artifactId = (terminal?.artifactIds as string[])?.[0];
    expect(artifactId).toBeTruthy();

    // Second org / user
    const orgB = runtime.platform.tenants.createOrganization("Other Org");
    expect(orgB.ok).toBe(true);
    if (!orgB.ok) return;
    const userB = runtime.platform.tenants.createUser({
      email: "other@unagency.local",
      displayName: "Other",
      organizationId: orgB.value.organizationId,
      roles: ["owner"],
    });
    expect(userB.ok).toBe(true);
    if (!userB.ok) return;
    runtime.platform.platformAuth.seedUser({
      email: "other@unagency.local",
      password: "admin",
      userId: userB.value.userId,
      organizationId: orgB.value.organizationId,
      roles: ["owner"],
    });
    const loginB = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/auth/login",
        body: {
          email: "other@unagency.local",
          password: "admin",
          organizationId: orgB.value.organizationId,
          deviceId: "device_b",
          scheme: "jwt",
        },
      })
    );
    expect(loginB.ok).toBe(true);
    if (!loginB.ok) return;
    const tokenB = (
      loginB.value.body as { data: { accessToken: string } }
    ).data.accessToken;

    const media = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/artifacts/${artifactId}/media`,
        headers: { authorization: `Bearer ${tokenB}` },
      })
    );
    expect(media.ok).toBe(true);
    if (!media.ok) return;
    expect(media.value.status).toBeGreaterThanOrEqual(400);
  }, 60000);

  it("video.generate completes with media artifact via fake async", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const created = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Short brand film",
          capabilityId: "video.generate",
          organizationId,
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const body = (created.value.body as { data: { executionId: string; status: string } })
      .data;
    expect(body.status).toBe("waiting_provider");
    const terminal = await pollUntilTerminal(
      runtime.platform.gateway,
      token,
      body.executionId
    );
    expect(terminal?.status).toBe("succeeded");
    expect(
      Array.isArray(terminal?.artifactIds) &&
        (terminal?.artifactIds as string[]).length
    ).toBeGreaterThan(0);
  }, 60000);
});
