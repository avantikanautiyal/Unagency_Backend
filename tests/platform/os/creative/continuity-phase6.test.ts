/**
 * Track A Phase A6 — product intelligence UX tests.
 */

import {
  BrandMemoryPromoteService,
  InMemoryBrandMemoryStore,
  buildContinuityObservabilitySummary,
  evaluateColorContradiction,
  evaluateSlotAwareness,
  resolveProductUxRollout,
  runProductIntelligenceUx,
} from "../../../../src/platform/os/creative";

describe("Track A Phase A6 product intelligence UX", () => {
  afterEach(() => {
    delete process.env.CONTINUITY_PRODUCT_UX;
    delete process.env.CONTINUITY_APPROVE_PROMOTE;
  });

  it("defaults CONTINUITY_PRODUCT_UX to off", async () => {
    expect(resolveProductUxRollout({})).toBe("off");
    await expect(
      runProductIntelligenceUx({
        brief: "use our logo",
        brandId: "b1",
        organizationId: "org",
        rollout: "off",
      })
    ).resolves.toBeNull();
  });

  it("asks slot awareness when approved logo exists and brief mentions logo", async () => {
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";
    const store = new InMemoryBrandMemoryStore();
    const promote = new BrandMemoryPromoteService(store, () => "on");
    await promote.promoteOnApprove({
      organizationId: "org_a6",
      brandId: "brand_a6",
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_logo",
      approvalReference: "ref",
      slotKey: "logo",
      assetId: "vault_logo",
      nowIso: "2026-08-25T09:00:00.000Z",
    });

    const prompt = await evaluateSlotAwareness({
      brief: "Make a social post and use our logo",
      brandId: "brand_a6",
      organizationId: "org_a6",
      store,
    });
    expect(prompt?.kind).toBe("slot_awareness");
    expect(prompt?.choices?.some((c) => c.id === "reuse_existing")).toBe(true);

    const resolved = await evaluateSlotAwareness({
      brief: "Make a social post and use our logo",
      brandId: "brand_a6",
      organizationId: "org_a6",
      metadata: { slotChoice: "reuse" },
      store,
    });
    expect(resolved).toBeNull();
  });

  it("detects color contradiction (brief red vs brand navy)", async () => {
    const store = new InMemoryBrandMemoryStore();
    await store.put({
      brandId: "brand_a6",
      organizationId: "org_a6",
      slotKey: "colors",
      tier: "canonical",
      version: 1,
      facts: { primary: "navy", accent: "gold" },
      source: { kind: "guidelines", at: "2026-08-25T09:00:00.000Z" },
      provenance: "Colors from guidelines",
      createdAt: "2026-08-25T09:00:00.000Z",
    });

    const prompt = await evaluateColorContradiction({
      brief: "Use a bold red palette for the launch ads",
      brandId: "brand_a6",
      organizationId: "org_a6",
      store,
    });
    expect(prompt?.kind).toBe("color_contradiction");
    expect(prompt?.code).toBe("CONTINUITY_COLOR_CONTRADICTION");

    const ok = await evaluateColorContradiction({
      brief: "Use a bold red palette for the launch ads",
      brandId: "brand_a6",
      organizationId: "org_a6",
      metadata: { contradictionChoice: "keep_brand_color" },
      store,
    });
    expect(ok).toBeNull();
  });

  it("on mode blocks generate with prompts; shadow does not", async () => {
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";
    const store = new InMemoryBrandMemoryStore();
    const promote = new BrandMemoryPromoteService(store, () => "on");
    await promote.promoteOnApprove({
      organizationId: "org_a6",
      brandId: "brand_a6",
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_logo",
      approvalReference: "ref",
      slotKey: "logo",
      assetId: "vault_logo",
      nowIso: "2026-08-25T09:00:00.000Z",
    });

    const on = await runProductIntelligenceUx({
      brief: "use our logo on the flyer",
      brandId: "brand_a6",
      organizationId: "org_a6",
      store,
      rollout: "on",
    });
    expect(on?.blockGenerate).toBe(true);
    expect(on?.prompts[0]?.code).toBe("CONTINUITY_SLOT_AWARENESS");

    const shadow = await runProductIntelligenceUx({
      brief: "use our logo on the flyer",
      brandId: "brand_a6",
      organizationId: "org_a6",
      store,
      rollout: "shadow",
    });
    expect(shadow?.blockGenerate).toBe(false);
    expect(shadow?.metadataExtras.continuityUxShadow).toBeDefined();
  });

  it("builds observability summary for admin diagnostics", () => {
    const summary = buildContinuityObservabilitySummary({
      metadata: {
        brandId: "brand_a6",
        forceStayInService: true,
        brandContextProvenance: "Using Logo v1 (approved 2026-08-25)",
        continuityIntentTags: ["reuse_logo"],
        assetIds: ["vault_logo"],
      },
      extras: {
        continuityPostGuards: {
          hardMissCodes: [],
          tasteCodes: ["BRAND_TONE_MISMATCH"],
          suggestRefine: true,
          retryCount: 0,
        },
      },
    });
    expect(summary.forceStayInService).toBe(true);
    expect(summary.suggestRefine).toBe(true);
    expect(summary.provenanceLine).toMatch(/Logo/i);
    expect(summary.boundAssetIds).toContain("vault_logo");
  });
});
