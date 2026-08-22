/**
 * Phase 5 — Brief+Brand+Knowledge → Plan → TaskGraphExecutor E2E.
 */

import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import { ControllableTaskCapabilityRunner } from "../../../src/platform/os/task-graph-executor";
import { InMemoryBrandRecordSource } from "../../../src/platform/os/brand";
import {
  InMemoryKnowledgeHitSource,
  type KnowledgeHit,
} from "../../../src/platform/os/knowledge";
import { getValidationSuite } from "../../../src/platform/validation/suites/validation-suites";
import { getValidationScenario } from "../../../src/platform/validation/scenarios/end-to-end-scenarios";

describe("Phase 5 — E2E task graph on production path", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("campaign plan executes through TaskGraphExecutor with parallel leaves", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const brandSource = new InMemoryBrandRecordSource();
    const knowledgeSource = new InMemoryKnowledgeHitSource();

    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource,
      knowledgeSource,
      taskCapabilityRunner: runner,
    });
    const seed = runtime.platform.seed!;

    brandSource.upsert({
      brandId: "brand_acme",
      organizationId: seed.organizationId,
      name: "Acme",
      updatedAt: "2026-08-16T00:00:00.000Z",
      guidelinesProfile: { tone: "premium and confident" },
    });
    knowledgeSource.upsert({
      chunkId: "k1",
      documentId: "doc1",
      organizationId: seed.organizationId,
      title: "Catalog",
      content: "Product: Acme X1\nPrice: ₹4,999\nBattery: 48 hours",
      retrievalScore: 90,
      retrievalMethod: "memory",
      sourceType: "USER_UPLOADED",
    } satisfies KnowledgeHit);

    const principal = {
      userId: seed.userId,
      organizationId: seed.organizationId,
      roles: ["owner"],
      email: seed.email,
    } as never;
    const tenant = { organizationId: seed.organizationId } as never;

    const created = await runtime.platform.executions.create(
      {
        prompt:
          "Create a complete product launch campaign with Instagram content, Meta ads and a landing page for Acme X1.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
        metadata: { brandId: "brand_acme" },
      },
      principal
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const plan = await runtime.platform.executions.getExecutionPlan(
      created.value.executionId,
      tenant
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.status).toBe("APPROVED_FOR_EXECUTION");
    expect(plan.value.planType).toBe("campaign");

    const graph = await runtime.platform.executions.executeTaskGraph(
      created.value.executionId,
      tenant,
      { maxConcurrency: 3 }
    );
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    expect(graph.value.status).toBe("SUCCEEDED");
    expect(graph.value.tasks.every((t) => t.status === "SUCCEEDED")).toBe(true);
    expect(graph.value.tasks.every((t) => t.outputRef?.preview)).toBe(true);
    expect(runner.getMaxObservedConcurrency()).toBeGreaterThanOrEqual(2);

    const status = await runtime.platform.executions.getTaskGraphStatus(
      created.value.executionId,
      tenant
    );
    expect(status.ok && status.value.status).toBe("SUCCEEDED");
  });

  it("M9 validation suite includes phase5_task_graph", () => {
    const suite = getValidationSuite("phase5_task_graph");
    expect(suite?.scenarioIds).toContain("task_graph_execution");
    const scenario = getValidationScenario("task_graph_execution");
    expect(scenario?.stages).toEqual(
      expect.arrayContaining([
        "task_graph_dag",
        "task_graph_parallelism",
        "task_graph_recovery",
        "task_graph_cancellation",
      ])
    );
  });
});
