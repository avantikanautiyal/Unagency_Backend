/**
 * Phase 3 — Brief + Brand + Knowledge on production execution path.
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

function knowledgeHit(
  partial: Partial<KnowledgeHit> &
    Pick<KnowledgeHit, "chunkId" | "documentId" | "organizationId" | "content">
): KnowledgeHit {
  return {
    title: "Catalog",
    retrievalScore: 90,
    retrievalMethod: "memory",
    sourceType: "USER_UPLOADED",
    ...partial,
  };
}

describe("Phase 3 — Brief + Brand + Knowledge → provider", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("E2E: brand tone + knowledge facts reach provider-bound result", async () => {
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
    knowledgeSource.upsert(
      knowledgeHit({
        chunkId: "k1",
        documentId: "doc_x1",
        organizationId: seed.organizationId,
        content: "Product: Acme X1\nPrice: ₹4,999\nBattery: 48 hours",
      })
    );

    const created = await runtime.platform.executions.create(
      {
        prompt: "Create a product launch announcement for Instagram about Acme X1.",
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

    const brief = await runtime.platform.executions.getBrief(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    const brand = await runtime.platform.executions.getBrandContext(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    const knowledge = await runtime.platform.executions.getKnowledgeContext(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(brief.ok && brand.ok && knowledge.ok).toBe(true);
    if (!brief.ok || !brand.ok || !knowledge.ok) return;

    expect(brand.value.tone.tone).toMatch(/premium and confident/i);
    expect(knowledge.value.facts.some((f) => /4,999/.test(f.value))).toBe(true);

    const resultText = JSON.stringify(created.value.result ?? "");
    expect(resultText).toMatch(/premium and confident|Brand tone=/i);
    expect(resultText).toMatch(/Knowledge facts=|₹4,999|Acme X1|48/);
  });

  it("tenant contamination: Org A ≠ Org B knowledge in provider payload", async () => {
    const knowledgeSource = new InMemoryKnowledgeHitSource();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      knowledgeSource,
    });
    const seed = runtime.platform.seed!;
    const orgB = runtime.platform.tenants.createOrganization("Org B Phase3");
    expect(orgB.ok).toBe(true);
    if (!orgB.ok) return;

    knowledgeSource.upsert(
      knowledgeHit({
        chunkId: "a1",
        documentId: "doc_a",
        organizationId: seed.organizationId,
        content: "Product: Alpha Price: ₹1,000",
      })
    );
    knowledgeSource.upsert(
      knowledgeHit({
        chunkId: "b1",
        documentId: "doc_b",
        organizationId: orgB.value.organizationId,
        content: "Product: Beta Price: ₹2,000",
      })
    );

    const execA = await runtime.platform.executions.create(
      {
        prompt: "Announce the product Alpha.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
      },
      {
        userId: seed.userId,
        organizationId: seed.organizationId,
        roles: ["owner"],
        email: seed.email,
      } as never
    );
    expect(execA.ok).toBe(true);
    if (!execA.ok) return;

    const knowledgeA = await runtime.platform.executions.getKnowledgeContext(
      execA.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(knowledgeA.ok).toBe(true);
    if (!knowledgeA.ok) return;
    expect(JSON.stringify(knowledgeA.value)).toMatch(/Alpha|₹1,000/);
    expect(JSON.stringify(knowledgeA.value)).not.toMatch(/Beta|₹2,000/);

    const textA = JSON.stringify(execA.value.result ?? "");
    expect(textA).not.toMatch(/Beta|₹2,000/);

    // Cross-tenant get must fail
    const cross = await runtime.platform.executions.getKnowledgeContext(
      execA.value.executionId,
      { organizationId: orgB.value.organizationId } as never
    );
    expect(cross.ok).toBe(false);
  });

  it("empty knowledge: no demo/sample facts", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      knowledgeSource: new InMemoryKnowledgeHitSource(),
    });
    const seed = runtime.platform.seed!;
    const created = await runtime.platform.executions.create(
      {
        prompt: "Write a short caption.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
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
    const knowledge = await runtime.platform.executions.getKnowledgeContext(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(knowledge.ok).toBe(true);
    if (!knowledge.ok) return;
    expect(knowledge.value.status).toBe("EMPTY");
    const text = JSON.stringify(created.value.result ?? "");
    expect(text).not.toMatch(/Brand voice is professional and clear/);
    expect(text).not.toMatch(/Inline knowledge for integration tests/);
  });
});
