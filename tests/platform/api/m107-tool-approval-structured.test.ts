/**
 * M10.7 — simulated tool approval + structured output via Enterprise HTTP.
 */

import {
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

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

describe("M10.7 tool approval + structured HTTP E2E", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("create → awaiting_approval → approve → structured succeed (handler once)", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const gateway = runtime.platform.gateway;

    const created = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Prepare a campaign plan and save it as a draft",
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
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const body = (created.value?.body as { data: Record<string, unknown> }).data;
    expect(body.status).toBe("awaiting_approval");
    expect(body.approvalRequired).toBe(true);
    expect(body.toolInvocationKey).toBeTruthy();
    expect(body.result).toMatchObject({ kind: "tool_approval_required" });
    const pending = body.pendingApprovals as
      | { invocationId: string; displayName: string; argumentsSummary: Record<string, unknown> }[]
      | undefined;
    expect(pending?.length).toBeGreaterThan(0);
    expect(JSON.stringify(pending)).not.toMatch(/api[_-]?key|secret|Authorization/i);

    const invocationId = String(
      pending?.[0]?.invocationId ?? body.toolInvocationKey
    );

    const approved = await gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${body.executionId}/tool-approvals/${encodeURIComponent(invocationId)}`,
        headers: { authorization: `Bearer ${token}` },
        body: { decision: "approve" },
      })
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const after = (approved.value?.body as { data: Record<string, unknown> }).data;
    expect(after.status).toBe("succeeded");
    expect(after.result).toMatchObject({ kind: "structured" });
    expect((after.result as { data?: { title?: string } }).data?.title).toBeTruthy();

    const dup = await gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${body.executionId}/tool-approvals/${encodeURIComponent(invocationId)}`,
        headers: { authorization: `Bearer ${token}` },
        body: { decision: "approve" },
      })
    );
    expect(dup.ok).toBe(true);
  }, 60_000);

  it("reject never completes as structured success", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const gateway = runtime.platform.gateway;
    const created = await gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Save draft plan",
          organizationId,
          capabilityId: "text.generate",
          toolNames: ["update_test_record"],
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const body = (created.value?.body as { data: Record<string, unknown> }).data;
    const key = String(body.toolInvocationKey);
    const rejected = await gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${body.executionId}/tool-approvals/${encodeURIComponent(key)}`,
        headers: { authorization: `Bearer ${token}` },
        body: { decision: "reject" },
      })
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const after = (rejected.value?.body as { data: Record<string, unknown> }).data;
    expect(after.status).toBe("failed");
    expect((after.result as { kind?: string } | undefined)?.kind).not.toBe("structured");
  }, 60_000);

  it("cross-tenant approval blocked", async () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const a = await loginDemo(runtime.platform);
    const created = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${a.token}` },
        body: {
          prompt: "draft",
          organizationId: a.organizationId,
          toolNames: ["update_test_record"],
          capabilityId: "text.generate",
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const body = (created.value?.body as { data: Record<string, unknown> }).data;
    const key = String(body.toolInvocationKey);

    const blocked = await runtime.platform.executions.decideToolApproval(
      String(body.executionId),
      key,
      "approve",
      {
        principalId: "u_other",
        kind: "user",
        organizationId: "org_other_tenant",
        roles: ["owner"],
        userId: "u_other",
      },
      {
        organizationId: "org_other_tenant",
        userId: "u_other",
      }
    );
    expect(blocked.ok).toBe(false);
  }, 60_000);
});
