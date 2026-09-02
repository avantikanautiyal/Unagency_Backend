/**
 * Track A Phase A2 — Intent → Resolve → Bind tests.
 */

import {
  BrandKnowledgeResolver,
  BrandMemoryPromoteService,
  InMemoryBrandMemoryStore,
  bindBrandContextPacketToMetadata,
  detectIntentGateFromBrief,
  runContinuityBindPipeline,
} from "../../../../src/platform/os";

describe("Track A Phase A2 continuity bind", () => {
  const orgId = "org_a2";
  const brandId = "brand_northstar";

  async function seedLogo(store: InMemoryBrandMemoryStore) {
    const promote = new BrandMemoryPromoteService(store, () => "on");
    await promote.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_seed",
      approvalReference: "ref",
      slotKey: "logo",
      assetId: "vault_logo_1",
      nowIso: "2026-08-25T10:00:00.000Z",
    });
  }

  it("intent gate does not rewrite the brief (L1)", () => {
    const brief = "Make an Instagram post and use our logo";
    const intent = detectIntentGateFromBrief(brief, {
      logoRole: "reuse_canonical",
      service: "social",
    });
    expect(intent.briefUnchanged).toBe(true);
    expect(intent.requiredSlots).toContain("logo");
  });

  it("resolver finds canonical logo and binder attaches assetId without prompt fields", async () => {
    const store = new InMemoryBrandMemoryStore();
    await seedLogo(store);
    const resolver = new BrandKnowledgeResolver(store);
    const intent = detectIntentGateFromBrief("social post — use our logo", {
      logoRole: "reuse_canonical",
      service: "social",
    });
    const resolved = await resolver.resolve({
      brandId,
      organizationId: orgId,
      intent,
    });
    expect(resolved.missingRequiredSlots).toEqual([]);
    expect(resolved.assets[0]?.assetId).toBe("vault_logo_1");

    const bound = bindBrandContextPacketToMetadata({
      brandId,
      resolve: resolved,
      metadata: { brandId, service: "social" },
    });
    expect(bound.needsAsk).toBe(false);
    expect(bound.metadata.assetIds).toEqual(
      expect.arrayContaining(["vault_logo_1"])
    );
    expect(bound.metadata.brandContextPacket).toBeDefined();
    expect(bound.metadata.enrichedPrompt).toBeUndefined();
    expect(bound.metadata.prompt).toBeUndefined();
    expect(String(bound.metadata.brandContextProvenance)).toMatch(/Logo/i);
  });

  it("missing required logo → needsAsk (do not invent)", async () => {
    const store = new InMemoryBrandMemoryStore();
    const resolver = new BrandKnowledgeResolver(store);
    const intent = detectIntentGateFromBrief("use our logo on the flyer", {
      logoRole: "reuse_canonical",
      service: "print",
    });
    const resolved = await resolver.resolve({
      brandId,
      organizationId: orgId,
      intent,
    });
    expect(resolved.missingRequiredSlots).toContain("logo");
    const bound = bindBrandContextPacketToMetadata({
      brandId,
      resolve: resolved,
      metadata: { brandId },
    });
    expect(bound.needsAsk).toBe(true);
  });

  it("pipeline off returns null", async () => {
    const store = new InMemoryBrandMemoryStore();
    await seedLogo(store);
    const out = await runContinuityBindPipeline({
      brief: "use our logo",
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "off",
    });
    expect(out).toBeNull();
  });

  it("pipeline shadow attaches shadow packet only (applied=false)", async () => {
    const store = new InMemoryBrandMemoryStore();
    await seedLogo(store);
    const brief = "Instagram post use our logo";
    const out = await runContinuityBindPipeline({
      brief,
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "shadow",
      metadata: { brandId },
    });
    expect(out?.briefUnchanged).toBe(true);
    expect(out?.applied).toBe(false);
    expect(out?.metadata.brandContextPacketShadow).toBeDefined();
    expect(out?.metadata.assetIds).toBeUndefined();
    expect(out?.metadata.brandContextPacket).toBeUndefined();
  });

  it("pipeline on binds logo asset for continuity case", async () => {
    const store = new InMemoryBrandMemoryStore();
    await seedLogo(store);
    const brief = "Make a feed post and use our logo";
    const out = await runContinuityBindPipeline({
      brief,
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "on",
      metadata: { brandId, service: "social", logoRole: "reuse_canonical" },
    });
    expect(out?.applied).toBe(true);
    expect(out?.needsAsk).toBe(false);
    expect(out?.briefUnchanged).toBe(true);
    expect(out?.metadata.assetIds).toEqual(
      expect.arrayContaining(["vault_logo_1"])
    );
    expect(out?.metadata.continuityBound).toBe(true);
  });

  it("pipeline on with missing logo reports needsAsk", async () => {
    const store = new InMemoryBrandMemoryStore();
    const out = await runContinuityBindPipeline({
      brief: "use our logo please",
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "on",
      metadata: { brandId, logoRole: "reuse_canonical" },
    });
    expect(out?.needsAsk).toBe(true);
    expect(out?.applied).toBe(true);
    expect(out?.packet.missingRequiredSlots).toContain("logo");
  });

  it("new_mark intent skips forced logo bind", async () => {
    const store = new InMemoryBrandMemoryStore();
    await seedLogo(store);
    const out = await runContinuityBindPipeline({
      brief: "Design a new logo for our chai brand",
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "on",
      metadata: {
        brandId,
        service: "branding",
        subtype: "logo-design",
        logoRole: "create_new",
      },
    });
    expect(out?.applied).toBe(false);
    expect(out?.metadata.continuitySkippedBind).toBe("new_mark");
  });

  it("logo-design create brief with colour theme does not ASK for approved logo/colors", async () => {
    const store = new InMemoryBrandMemoryStore();
    const out = await runContinuityBindPipeline({
      brief:
        "Create a logo for our brand. The colour theme should be silver blue and metallic red.",
      brandId,
      organizationId: orgId,
      resolver: new BrandKnowledgeResolver(store),
      rollout: "on",
      metadata: {
        brandId,
        service: "branding",
        subtype: "logo-design",
      },
    });
    expect(out?.needsAsk).toBe(false);
    expect(out?.intent.intentTags).toContain("new_mark");
    expect(out?.packet.missingRequiredSlots ?? []).toEqual([]);
  });
});
