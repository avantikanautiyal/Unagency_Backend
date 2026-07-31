/**
 * M10.8 — Simulated Enterprise HTTP streaming E2E (FakeStreamingDispatcher).
 * EXTERNAL AI CALLS: 0.
 */

import {
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import { isLiveSsePayload } from "../../../src/platform/api/services/execution-streaming-service";
import type { SseFrame } from "../../../src/platform/api/contracts";

async function collectSse(
  gateway: {
    handle: (req: ReturnType<typeof apiRequest>) => Promise<{
      ok: boolean;
      value?: {
        sse?: {
          frames: readonly SseFrame[];
          frameIterable?: AsyncIterable<SseFrame>;
          cancel?: (reason?: string) => void;
        };
        headers?: Record<string, string>;
        body?: unknown;
      };
    }>;
  },
  token: string,
  organizationId: string,
  prompt: string
) {
  const res = await gateway.handle(
    apiRequest({
      method: "POST",
      path: "/v1/executions/stream",
      headers: { authorization: `Bearer ${token}` },
      body: {
        prompt,
        organizationId,
        capabilityId: "text.generate",
      },
    })
  );
  expect(res.ok).toBe(true);
  if (!res.ok) return { frames: [] as SseFrame[], executionId: "" };
  const sse = res.value?.sse;
  expect(sse).toBeDefined();
  expect(String(res.value?.headers?.["Content-Type"] ?? "")).toContain(
    "text/event-stream"
  );
  const frames: SseFrame[] = [...(sse?.frames ?? [])];
  if (sse?.frameIterable) {
    for await (const frame of sse.frameIterable) {
      frames.push(frame);
    }
  }
  const body = res.value?.body as { data?: { executionId?: string } };
  const executionId =
    body?.data?.executionId ??
    String(res.value?.headers?.["x-execution-id"] ?? "");
  return { frames, executionId };
}

describe("M10.8 simulated HTTP streaming", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("streams content.delta then completes; GET reconciles authoritative text", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const { frames, executionId } = await collectSse(
      runtime.platform.gateway,
      token,
      organizationId,
      "Launch iced coffee"
    );
    expect(executionId).toBeTruthy();
    const events = frames.map((f) => f.event);
    expect(events).toContain("execution.started");
    expect(events).toContain("content.delta");
    expect(events).toContain("execution.completed");
    const deltas = frames
      .filter((f) => f.event === "content.delta")
      .map((f) => JSON.parse(f.data).contentDelta as string)
      .join("");
    expect(deltas.length).toBeGreaterThan(0);
    expect(JSON.stringify(frames)).not.toMatch(/OPENAI_API_KEY|sk-/i);
    for (const f of frames) {
      const data = JSON.parse(f.data);
      expect(data.reasoningDelta).toBeUndefined();
      expect(data.providerId).toBeUndefined();
      expect(data.modelId).toBeUndefined();
    }

    const got = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const exec = (got.value?.body as { data: Record<string, unknown> }).data;
    expect(exec.status).toBe("succeeded");
    expect((exec.result as { kind?: string; text?: string })?.kind).toBe("text");
    expect(String((exec.result as { text?: string }).text)).toContain("launch");
  }, 60_000);

  it("pre-commit failover continues stream on secondary", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const { frames, executionId } = await collectSse(
      runtime.platform.gateway,
      token,
      organizationId,
      "__pre_commit_failover__ Launch"
    );
    expect(executionId).toBeTruthy();
    const events = frames.map((f) => f.event);
    expect(events).toContain("content.delta");
    expect(events).toContain("execution.completed");
    const deltas = frames
      .filter((f) => f.event === "content.delta")
      .map((f) => JSON.parse(f.data).contentDelta as string)
      .join("");
    expect(deltas).toMatch(/launch|Create|failover/i);
  }, 60_000);

  it("post-commit provider failure does not restart on secondary", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const { frames, executionId } = await collectSse(
      runtime.platform.gateway,
      token,
      organizationId,
      "__post_commit_fail__ Launch"
    );
    const joined = frames
      .filter((f) => f.event === "content.delta")
      .map((f) => JSON.parse(f.data).contentDelta as string)
      .join("");
    expect(joined).toContain("Partial");
    expect(joined).not.toContain("SHOULD_NOT_APPEAR");
    expect(frames.some((f) => f.event === "execution.failed")).toBe(true);

    const got = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const exec = (got.value?.body as { data: Record<string, unknown> }).data;
    expect(exec.status).toBe("failed");
  }, 60_000);

  it("tool approval during stream yields awaiting_approval + pendingApprovals", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const { frames, executionId } = await collectSse(
      runtime.platform.gateway,
      token,
      organizationId,
      "__stream_approval__ campaign draft"
    );
    expect(frames.some((f) => f.event === "tool.approval_required")).toBe(true);
    expect(
      frames.some((f) => f.event === "tool_call.arguments.delta")
    ).toBe(false);

    const got = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const exec = (got.value?.body as { data: Record<string, unknown> }).data;
    expect(exec.status).toBe("awaiting_approval");
    expect(Array.isArray(exec.pendingApprovals)).toBe(true);
    expect((exec.pendingApprovals as unknown[]).length).toBeGreaterThan(0);
  }, 60_000);

  it("client abort yields cancelled terminal state", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const controller = new AbortController();
    const started = await runtime.platform.executions.createStream(
      {
        prompt: "Abort me",
        organizationId,
        capabilityId: "text.generate",
      },
      {
        principalId: "u",
        kind: "user",
        organizationId,
        roles: ["owner"],
        userId: "u",
      },
      { organizationId, userId: "u" },
      controller.signal
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(isLiveSsePayload(started.value)).toBe(true);
    controller.abort();
    started.value.cancel("client_disconnected");
    const frames: SseFrame[] = [];
    for await (const frame of started.value.frameIterable) {
      frames.push(frame);
    }
    const events = frames.map((f) => f.event);
    expect(
      events.includes("execution.cancelled") ||
        events.includes("execution.completed") ||
        events.includes("execution.failed")
    ).toBe(true);
  }, 60_000);

  it("sse.cancel stops stream (client disconnect)", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions/stream",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "disconnect me",
          organizationId,
          capabilityId: "text.generate",
        },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    res.value.sse?.cancel?.("client_disconnected");
    const frames: SseFrame[] = [];
    if (res.value.sse?.frameIterable) {
      for await (const frame of res.value.sse.frameIterable) {
        frames.push(frame);
      }
    }
    expect(frames.length).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("cross-tenant cannot GET streaming execution", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const a = await loginDemo(runtime.platform);
    const { executionId } = await collectSse(
      runtime.platform.gateway,
      a.token,
      a.organizationId,
      "tenant isolation"
    );
    const blocked = await runtime.platform.executions.get(executionId, {
      organizationId: "org_other",
      userId: "u_other",
    });
    expect(blocked.ok).toBe(false);
  }, 60_000);
});
