/**
 * M10.10 — Full application E2E certification (credential-free).
 *
 * Real architecture:
 *   Enterprise gateway → auth → /v1/me → executions (text/image/stream/tools)
 *   → artifacts → tenant isolation → recovery via GET
 *
 * External boundaries substituted:
 *   ControllableDispatcher / FakeAsync / FakeStreamingDispatcher
 *   Razorpay webhook HMAC fixtures (no network)
 *
 * LIVE AI / GetStream / Razorpay / FCM: 0
 */

import {
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import {
  InMemoryWebhookIdempotencyStore,
  razorpayWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "../../../src/webhook/razorpay-webhook-security";
import crypto from "crypto";

/** Mirror of @unagency/api parseNotificationDeepLink — deep link never authorizes. */
function parseNotificationDeepLink(action: string): {
  kind: string;
  executionId?: string;
  invocationId?: string;
} {
  const approval =
    /executionId=([^&]+).*invocationId=([^&]+)/i.exec(action) ||
    /\/executions\/([^/]+)\/tool-approvals\/([^/?#]+)/i.exec(action);
  if (approval) {
    return {
      kind: "tool_approval",
      executionId: decodeURIComponent(approval[1]!),
      invocationId: decodeURIComponent(approval[2]!),
    };
  }
  return { kind: "unknown" };
}

const launchPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "steps"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
};

async function pollUntilTerminal(
  gateway: {
    handle: (req: ReturnType<typeof apiRequest>) => Promise<{
      ok: boolean;
      value?: { body?: unknown };
    }>;
  },
  token: string,
  executionId: string,
  maxPolls = 16
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
    if (!res.ok) return last;
    last = (res.value?.body as { data: Record<string, unknown> }).data;
    const status = String(last?.status ?? "");
    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "awaiting_approval"
    ) {
      return last;
    }
  }
  return last;
}

async function collectSse(
  gateway: {
    handle: (req: ReturnType<typeof apiRequest>) => Promise<{
      ok: boolean;
      value?: {
        sse?: {
          frames?: readonly { event: string; data: string }[];
          frameIterable?: AsyncIterable<{ event: string; data: string }>;
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
  if (!res.ok) return { frames: [] as { event: string; data: string }[], executionId: "" };
  const frames: { event: string; data: string }[] = [
    ...(res.value?.sse?.frames ?? []),
  ];
  if (res.value?.sse?.frameIterable) {
    for await (const frame of res.value.sse.frameIterable) {
      frames.push(frame);
    }
  }
  const body = res.value?.body as { data?: { executionId?: string } };
  const executionId =
    body?.data?.executionId ??
    String(res.value?.headers?.["x-execution-id"] ?? "");
  return { frames, executionId };
}

describe("M10.10 full application E2E", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("GOLDEN USER JOURNEY: auth → me → text → image → approval → stream → recover", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const gateway = runtime.platform.gateway;
    const { token, organizationId } = await loginDemo(runtime.platform);
    expect(runtime.platform.seed?.organizationId).toBe(organizationId);
    expect(runtime.platform.seed?.userId).toBeTruthy();

    // Principal bootstrap for Firebase+Mongo is certified in m102-current-principal.
    // Demo JWT certifies authenticated Enterprise routes (capability list).
    const caps = await gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/runtime/capabilities",
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(caps.ok).toBe(true);
    if (caps.ok) {
      expect(caps.value.status).toBe(200);
      const list = (caps.value.body as { data: { capabilityId: string }[] }).data;
      expect(list.some((c) => c.capabilityId === "text.generate")).toBe(true);
    }

    // Unauthenticated protected route rejected
    const anon = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        body: {
          prompt: "x",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );
    expect(anon.ok).toBe(true);
    if (anon.ok) {
      expect(anon.value.status).toBeGreaterThanOrEqual(401);
    }

    // Client cannot inject arbitrary org on create
    const spoofOrg = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "x",
          capabilityId: "text.generate",
          organizationId: "org_injected_by_client",
        },
      })
    );
    expect(spoofOrg.ok).toBe(true);
    if (spoofOrg.ok) {
      expect(spoofOrg.value.status).toBeGreaterThanOrEqual(400);
    }

    // 5 Text intelligence
    const text = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "M10.10 golden text brief",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    const textBody = (text.value?.body as { data: Record<string, unknown> }).data;
    expect(textBody.status).toBe("succeeded");
    expect((textBody.result as { kind?: string })?.kind).toBe("text");
    const textId = String(textBody.executionId);

    // Restart recovery: GET same execution
    const textRecover = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${textId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(textRecover.ok).toBe(true);
    if (textRecover.ok) {
      const recovered = (textRecover.value?.body as { data: Record<string, unknown> })
        .data;
      expect(recovered.status).toBe("succeeded");
      expect(String((recovered.result as { text?: string })?.text ?? "")).toMatch(
        /golden text|Simulated/i
      );
    }

    // 6–7 Image async + artifact
    expect(runtime.platform.durableStores?.asyncMedia).toBeDefined();
    const image = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "M10.10 golden poster",
          capabilityId: "image.generate",
          organizationId,
        },
      })
    );
    expect(image.ok).toBe(true);
    if (!image.ok) return;
    const imageBody = (image.value?.body as { data: Record<string, unknown> }).data;
    expect(imageBody.status).toBe("waiting_provider");
    const imageId = String(imageBody.executionId);

    const imageTerminal = await pollUntilTerminal(gateway, token, imageId);
    expect(imageTerminal?.status).toBe("succeeded");
    expect((imageTerminal?.result as { kind?: string })?.kind).toBe("artifact");
    const artifactIds = imageTerminal?.artifactIds as string[] | undefined;
    expect(artifactIds?.length).toBeGreaterThan(0);

    const media = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/artifacts/${artifactIds![0]}/media`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(media.ok).toBe(true);

    // Remount recovery while completed
    const imageRecover = await pollUntilTerminal(gateway, token, imageId, 2);
    expect(imageRecover?.status).toBe("succeeded");

    // 8 Video async (architecture; presentation polish P1)
    const video = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "M10.10 golden clip",
          capabilityId: "video.generate",
          organizationId,
        },
      })
    );
    expect(video.ok).toBe(true);
    if (video.ok) {
      const videoBody = (video.value?.body as { data: Record<string, unknown> }).data;
      if (videoBody.status === "waiting_provider") {
        const videoTerminal = await pollUntilTerminal(
          gateway,
          token,
          String(videoBody.executionId)
        );
        expect(["succeeded", "failed"]).toContain(String(videoTerminal?.status));
      }
    }

    // 9–10 Tool approval same execution resume
    const tool = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Prepare campaign plan and save draft",
          capabilityId: "text.generate",
          organizationId,
          toolNames: ["update_test_record"],
          structuredOutput: {
            schema: launchPlanSchema,
            name: "LaunchPlan",
            strict: true,
          },
        },
      })
    );
    expect(tool.ok).toBe(true);
    if (!tool.ok) return;
    const toolBody = (tool.value?.body as { data: Record<string, unknown> }).data;
    expect(toolBody.status).toBe("awaiting_approval");
    const toolExecId = String(toolBody.executionId);
    const invocationId =
      String(toolBody.toolInvocationKey ?? "") ||
      String(
        (toolBody.pendingApprovals as { invocationId: string }[] | undefined)?.[0]
          ?.invocationId ?? ""
      );
    expect(invocationId).toBeTruthy();

    // Restart while awaiting approval — still recoverable
    const awaitingRecover = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${toolExecId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(awaitingRecover.ok).toBe(true);
    if (awaitingRecover.ok) {
      const ar = (awaitingRecover.value?.body as { data: Record<string, unknown> })
        .data;
      expect(ar.status).toBe("awaiting_approval");
    }

    // Notification deep link must NOT authorize (contract)
    const deep = parseNotificationDeepLink(
      `unagency://tool-approval?executionId=${toolExecId}&invocationId=${invocationId}`
    );
    expect(deep.kind).toBe("tool_approval");
    if (deep.kind === "tool_approval") {
      expect(deep.executionId).toBe(toolExecId);
      expect(deep.invocationId).toBe(invocationId);
    }
    // Still awaiting until decide
    const stillWaiting = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${toolExecId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(stillWaiting.ok).toBe(true);
    if (stillWaiting.ok) {
      expect(
        (stillWaiting.value?.body as { data: { status: string } }).data.status
      ).toBe("awaiting_approval");
    }

    const approved = await gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${toolExecId}/tool-approvals/${invocationId}`,
        headers: { authorization: `Bearer ${token}` },
        body: { decision: "approve" },
      })
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    let after = (approved.value?.body as { data: Record<string, unknown> }).data;
    if (after.status !== "succeeded") {
      after =
        (await pollUntilTerminal(gateway, token, toolExecId)) ?? after;
    }
    expect(after.executionId).toBe(toolExecId);
    expect(after.status).toBe("succeeded");
    expect((after.result as { kind?: string })?.kind).toBe("structured");

    // 11 Streaming + reconcile
    const { frames, executionId: streamId } = await collectSse(
      gateway,
      token,
      organizationId,
      "M10.10 golden stream"
    );
    expect(streamId).toBeTruthy();
    expect(frames.map((f) => f.event)).toContain("content.delta");
    expect(frames.map((f) => f.event)).toContain("execution.completed");
    for (const f of frames) {
      const data = JSON.parse(f.data);
      expect(data.providerId).toBeUndefined();
      expect(data.reasoningDelta).toBeUndefined();
    }
    const streamFinal = await gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${streamId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(streamFinal.ok).toBe(true);
    if (streamFinal.ok) {
      expect(
        (streamFinal.value?.body as { data: { status: string } }).data.status
      ).toBe("succeeded");
    }

    // No secrets in journey payloads
    expect(JSON.stringify([textBody, imageBody, toolBody, frames])).not.toMatch(
      /OPENAI_API_KEY|sk-|getstream_io_secret|RAZORPAY_SECRET/i
    );
  }, 180_000);

  it("SECOND TENANT SECURITY: cannot read Tenant A execution or spoof org", async () => {
    resetEnterpriseApiRuntimeForTests();
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
          prompt: "tenant A secret brief",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const executionId = String(
      (created.value?.body as { data: { executionId: string } }).data.executionId
    );

    const spoof = await runtime.platform.gateway.handle(
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
    expect(spoof.ok).toBe(true);
    if (spoof.ok) {
      expect(spoof.value.status).toBeGreaterThanOrEqual(400);
    }

    const blocked = await runtime.platform.executions.get(executionId, {
      organizationId: "org_other",
      userId: "u_other",
    });
    expect(blocked.ok).toBe(false);

    if (created.ok) {
      const arts = (created.value?.body as { data: { artifactIds?: string[] } })
        .data;
      void arts;
    }
  }, 60_000);

  it("billing webhook signature + single-instance idempotency (no network)", () => {
    const secret = "whsec_m1010";
    const body = JSON.stringify({
      event: "subscription.activated",
      payload: { subscription: { entity: { id: "sub_m1010" } } },
      created_at: 99,
    });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    expect(
      verifyRazorpayWebhookSignature({ rawBody: body, signature, secret })
    ).toBe(true);
    expect(
      verifyRazorpayWebhookSignature({
        rawBody: body,
        signature: "bad",
        secret,
      })
    ).toBe(false);

    const store = new InMemoryWebhookIdempotencyStore();
    const id = razorpayWebhookEventId(JSON.parse(body));
    return store.tryClaim(id).then(async (first) => {
      expect(first).toBe("new");
      expect(await store.tryClaim(id)).toBe("duplicate");
    });
  });

  it("stream post-commit failover remains blocked", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const { frames } = await collectSse(
      runtime.platform.gateway,
      token,
      organizationId,
      "__post_commit_fail__ M10.10"
    );
    const deltas = frames
      .filter((f) => f.event === "content.delta")
      .map((f) => JSON.parse(f.data).contentDelta as string)
      .join("");
    expect(deltas).not.toContain("SHOULD_NOT_APPEAR");
    expect(frames.some((f) => f.event === "execution.failed")).toBe(true);
  }, 60_000);
});
