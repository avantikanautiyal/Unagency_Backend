/**
 * Phase 2 — Brand Intelligence on production execution path + multi-brand isolation.
 */

import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";
import {
  InMemoryBrandRecordSource,
  type BrandRecord,
} from "../../../src/platform/os/brand";

function record(
  partial: Partial<BrandRecord> & Pick<BrandRecord, "brandId" | "organizationId" | "name">
): BrandRecord {
  return {
    updatedAt: "2026-08-15T12:00:00.000Z",
    ...partial,
  };
}

describe("Phase 2 — Brief + Brand → provider execution", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("E2E: Brand A playful tone reaches provider-bound result text", async () => {
    const brandSource = new InMemoryBrandRecordSource();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource,
    });
    const seed = runtime.platform.seed!;
    brandSource.upsert(
      record({
        brandId: "brand_playful",
        organizationId: seed.organizationId,
        name: "Playful Brand",
        positioning: "accessible",
        colors: ["#FF5500", "#00CCFF"],
        guidelinesProfile: {
          tone: "playful and energetic",
          photographyStyle: "colorful",
          brandPersonality: "witty",
        },
      })
    );

    const created = await runtime.platform.executions.create(
      {
        prompt: "Write a product launch announcement.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        workspaceId: seed.workspaceId,
        metadata: { brandId: "brand_playful" },
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

    const brandCtx = await runtime.platform.executions.getBrandContext(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(brandCtx.ok).toBe(true);
    if (!brandCtx.ok) return;
    expect(brandCtx.value.tone.tone).toMatch(/playful/i);
    expect(brandCtx.value.brandId).toBe("brand_playful");

    const brief = await runtime.platform.executions.getBrief(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(brief.ok).toBe(true);

    const resultText =
      created.value.result &&
      typeof created.value.result === "object" &&
      "text" in created.value.result
        ? String((created.value.result as { text?: string }).text ?? "")
        : JSON.stringify(created.value.result ?? "");
    expect(resultText).toMatch(/playful and energetic/i);
    expect(resultText).toMatch(/Brand tone=/i);
  });

  it("multi-brand: Brand A and Brand B do not contaminate", async () => {
    const brandSource = new InMemoryBrandRecordSource();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource,
    });
    const seed = runtime.platform.seed!;
    brandSource.upsert(
      record({
        brandId: "brand_a",
        organizationId: seed.organizationId,
        name: "A",
        guidelinesProfile: { tone: "playful-UNIQUE-A" },
      })
    );
    brandSource.upsert(
      record({
        brandId: "brand_b",
        organizationId: seed.organizationId,
        name: "B",
        guidelinesProfile: { tone: "formal-UNIQUE-B" },
      })
    );

    const principal = {
      userId: seed.userId,
      organizationId: seed.organizationId,
      roles: ["owner"],
      email: seed.email,
    } as never;

    const execA = await runtime.platform.executions.create(
      {
        prompt: "Write a product announcement.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        metadata: { brandId: "brand_a" },
      },
      principal
    );
    const execB = await runtime.platform.executions.create(
      {
        prompt: "Write a product announcement.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        metadata: { brandId: "brand_b" },
      },
      principal
    );
    expect(execA.ok && execB.ok).toBe(true);
    if (!execA.ok || !execB.ok) return;

    const textA = JSON.stringify(execA.value.result ?? "");
    const textB = JSON.stringify(execB.value.result ?? "");
    expect(textA).toMatch(/playful-UNIQUE-A/);
    expect(textA).not.toMatch(/formal-UNIQUE-B/);
    expect(textB).toMatch(/formal-UNIQUE-B/);
    expect(textB).not.toMatch(/playful-UNIQUE-A/);
  });

  it("no brandId → MISSING context, no sample brand leakage", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource: new InMemoryBrandRecordSource(),
    });
    const seed = runtime.platform.seed!;
    const created = await runtime.platform.executions.create(
      {
        prompt: "Write a caption for this product.",
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
    const brandCtx = await runtime.platform.executions.getBrandContext(
      created.value.executionId,
      { organizationId: seed.organizationId } as never
    );
    expect(brandCtx.ok).toBe(true);
    if (!brandCtx.ok) return;
    expect(brandCtx.value.status).toBe("MISSING");
    const text = JSON.stringify(created.value.result ?? "");
    expect(text).not.toMatch(/Empower customers through/i);
    expect(text).not.toMatch(/proprietary brand brain/i);
  });

  it("tenant B cannot read tenant A brand context", async () => {
    const brandSource = new InMemoryBrandRecordSource();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
      brandSource,
    });
    const seed = runtime.platform.seed!;
    brandSource.upsert(
      record({
        brandId: "brand_a",
        organizationId: seed.organizationId,
        name: "A",
        guidelinesProfile: { tone: "confidential-tone" },
      })
    );
    const created = await runtime.platform.executions.create(
      {
        prompt: "Announce the product.",
        capabilityId: "text.generate",
        organizationId: seed.organizationId,
        metadata: { brandId: "brand_a" },
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

    const orgB = runtime.platform.tenants.createOrganization("Other Org Phase2");
    expect(orgB.ok).toBe(true);
    if (!orgB.ok) return;

    const cross = await runtime.platform.executions.getBrandContext(
      created.value.executionId,
      { organizationId: orgB.value.organizationId } as never
    );
    expect(cross.ok).toBe(false);
  });
});
