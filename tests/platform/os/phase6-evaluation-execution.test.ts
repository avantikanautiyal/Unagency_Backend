/**
 * Phase 6 — ExecutionApiService + M9 validation harness coverage.
 */

import {
  createBriefIntelligenceEngine,
  createExecutionIntelligenceOsEngine,
  createProductionNegotiationPlatform,
  ControllableTaskCapabilityRunner,
} from "../../../src/platform/os";
import { ExecutionApiService } from "../../../src/platform/api/services/execution-api-service";
import type { TenantContext } from "../../../src/platform/api/contracts";
import { getValidationSuite } from "../../../src/platform/validation/suites/validation-suites";
import { getValidationScenario } from "../../../src/platform/validation/scenarios/end-to-end-scenarios";

const tenant: TenantContext = {
  organizationId: "org_a",
  workspaceId: "ws_a",
};

describe("Phase 6 — M9 validation definitions", () => {
  it("includes phase6_evaluation_governance suite", () => {
    const suite = getValidationSuite("phase6_evaluation_governance");
    expect(suite?.scenarioIds).toContain("evaluation_governance");
    const scenario = getValidationScenario("evaluation_governance");
    expect(scenario?.stages).toEqual(
      expect.arrayContaining([
        "spec_guard",
        "brand_guard",
        "governance_decision",
        "human_review",
        "execution_approval",
        "tenant_isolation",
      ])
    );
  });
});

describe("Phase 6 — ExecutionApiService governance path", () => {
  it("executeTaskGraph evaluates and can APPROVE", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const svc = new ExecutionApiService({
      nowIso: () => new Date().toISOString(),
      createId: (p: string) => `${p}_p6`,
      taskCapabilityRunner: runner,
    } as never);

    const brief = createBriefIntelligenceEngine().createBrief({
      tenant: {
        organizationId: tenant.organizationId,
        requestId: "req_p6",
        executionId: "exec_api_p6",
      },
      rawPrompt: "Write a spring product caption for marketing.",
      clientCapabilityId: "text.generate",
    });
    const plan = createExecutionIntelligenceOsEngine({
      capabilityRegistry: createProductionNegotiationPlatform().capabilityRegistry,
    }).createPlan({
      organizationId: tenant.organizationId,
      executionId: "exec_api_p6",
      requestId: "req_p6",
      brief: { ...brief, executionId: "exec_api_p6" },
    });

    const anySvc = svc as unknown as {
      planByExecutionId: Map<string, typeof plan>;
      briefByExecutionId: Map<string, typeof brief>;
      executionStore: Map<string, { executionId: string; organizationId: string }>;
      extrasStore: Map<string, Record<string, unknown>>;
    };
    anySvc.planByExecutionId.set("exec_api_p6", plan);
    anySvc.briefByExecutionId.set("exec_api_p6", brief);
    anySvc.executionStore.set("exec_api_p6", {
      executionId: "exec_api_p6",
      organizationId: tenant.organizationId,
    });
    anySvc.extrasStore.set("exec_api_p6", {
      structuredExecutionPlan: plan,
      structuredBrief: brief,
    });

    const result = await svc.executeTaskGraph("exec_api_p6", tenant);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("SUCCEEDED");
    expect(result.value.approvalStatus).toBe("APPROVED");
  });

  it("cross-tenant task graph status fails closed", async () => {
    const svc = new ExecutionApiService({
      nowIso: () => new Date().toISOString(),
      createId: (p: string) => `${p}_p6`,
      taskCapabilityRunner: new ControllableTaskCapabilityRunner(),
    } as never);
    const other: TenantContext = {
      organizationId: "org_b",
      workspaceId: "ws_b",
    };
    const got = await svc.getTaskGraphStatus("missing_exec", other);
    expect(got.ok).toBe(false);
  });
});
