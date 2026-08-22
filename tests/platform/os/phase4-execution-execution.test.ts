/**
 * Phase 4 — ExecutionPlan on production execution path (no TaskGraph execution).
 */

import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import { InMemoryBrandRecordSource } from "../../../src/platform/os/brand";
import {
  InMemoryKnowledgeHitSource,
  type KnowledgeHit,
} from "../../../src/platform/os/knowledge";

describe("Phase 4 — Brief + Brand + Knowledge → ExecutionPlan", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("E2E: campaign request produces validated multi-task plan", async () => {
    const brandSource = new InMemoryBrandRecordSource();
    const knowledgeSource = new InMemoryKnowledgeHitSource();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource,
      knowledgeSource,
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
      documentId: "doc_x1",
      organizationId: seed.organizationId,
      title: "Catalog",
      content: "Product: Acme X1\nPrice: ₹4,999\nBattery: 48 hours",
      retrievalScore: 90,
      retrievalMethod: "memory",
      sourceType: "USER_UPLOADED",
    } satisfies KnowledgeHit);

    const created = await runtime.platform.executions.create(
      {
        prompt:
          "Create a complete product launch campaign with Instagram content, Meta ads and a landing page for Acme X1.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
        metadata: { brandId: "brand_acme" },
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

    const plan = await runtime.platform.executions.getExecutionPlan(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.value.status).toBe("APPROVED_FOR_EXECUTION");
    expect(plan.value.planType).toBe("campaign");
    expect(plan.value.tasks.length).toBeGreaterThanOrEqual(5);
    expect(plan.value.provenance.briefId).toBeTruthy();
    expect(plan.value.organizationId).toBe(seed.organizationId);
    // Phase 4: still a single parent execution — no child task dispatch
    expect(created.value.status).toMatch(/succeeded|completed|queued|running|awaiting/);
    expect(plan.value.tasks.every((t) => t.requiredCapabilities.length > 0)).toBe(
      true
    );
  });

  it("simple caption produces single-task plan and keeps execution compatible", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const seed = runtime.platform.seed!;
    const created = await runtime.platform.executions.create(
      {
        prompt: "Write a caption for my product.",
        capabilityId: "text.generate",
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
    const plan = await runtime.platform.executions.getExecutionPlan(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.tasks.length).toBe(1);
    expect(plan.value.status).toBe("APPROVED_FOR_EXECUTION");
  });

  it("idempotent: same executionId does not create uncontrolled duplicate plans", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const seed = runtime.platform.seed!;
    const principal = {
      userId: seed.userId,
      organizationId: seed.organizationId,
      roles: ["owner"],
      email: seed.email,
    } as never;
    const created = await runtime.platform.executions.create(
      {
        prompt: "Write a short product caption.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
        idempotencyKey: "phase4-idem-1",
      },
      principal
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const again = await runtime.platform.executions.create(
      {
        prompt: "Write a short product caption.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
        idempotencyKey: "phase4-idem-1",
      },
      principal
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.executionId).toBe(created.value.executionId);
    const plan = await runtime.platform.executions.getExecutionPlan(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.planVersion).toBe(1);
  });
});
