/**
 * Track A Phase A4 — Selective OS: refine packet, packs, brief assist, router pins.
 */

import {
  buildBriefAssistQuestions,
  buildRefineContinuityMetadata,
  clientOptedInBriefAssist,
  detectPackIntent,
  extractContinuitySnapshot,
  isBriefEmptyOrVague,
  planMultiDeliverablePack,
  resolveBriefAssistRollout,
  resolvePacksRollout,
  runBriefAssist,
  runPackPlannerOnCreate,
  sharpenContinuityRoutingPins,
} from "../../../../src/platform/os/creative";
import { applyDirectPassthroughMetadata } from "../../../../src/platform/api/services/execution-thin-path";
import { emptyBrandContextPacket } from "../../../../src/platform/os/creative";

describe("Track A Phase A4 selective OS", () => {
  afterEach(() => {
    delete process.env.CONTINUITY_PACKS;
    delete process.env.CONTINUITY_BRIEF_ASSIST;
  });

  describe("refine packet continuity", () => {
    it("builds next-create metadata with same packet and assets (no prompt rewrite)", () => {
      const packet = emptyBrandContextPacket("brand_a4");
      const snap = extractContinuitySnapshot({
        brandId: "brand_a4",
        brandContextPacket: packet,
        assetIds: ["vault_logo_1"],
        preferredProviderId: "provider.x",
        preferredModelId: "model.y",
        continuityBound: true,
      });
      expect(snap?.assetIds).toEqual(["vault_logo_1"]);

      const meta = buildRefineContinuityMetadata({
        snapshot: snap!,
        refinementId: "refn_1",
        sourceExecutionId: "exec_src",
      });
      expect(meta.continuityRefineReuse).toBe(true);
      expect(meta.brandContextPacket).toBe(packet);
      expect(meta.assetIds).toEqual(["vault_logo_1"]);
      expect(meta.preferredProviderId).toBe("provider.x");
      expect(meta.prompt).toBeUndefined();
      expect(meta.enrichedPrompt).toBeUndefined();
    });

    it("reads nested continuitySnapshot from extras", () => {
      const packet = emptyBrandContextPacket("brand_a4");
      const snap = extractContinuitySnapshot({
        continuitySnapshot: {
          brandId: "brand_a4",
          brandContextPacket: packet,
          assetIds: ["a1"],
        },
      });
      expect(snap?.brandId).toBe("brand_a4");
      expect(snap?.assetIds).toEqual(["a1"]);
    });
  });

  describe("pack planner", () => {
    it("defaults CONTINUITY_PACKS to off", () => {
      expect(resolvePacksRollout({})).toBe("off");
      expect(
        runPackPlannerOnCreate({
          brief: "Create 5 social posts for launch",
          organizationId: "org",
          rollout: "off",
        })
      ).toBeNull();
    });

    it("detects count packs from brief and plans ≤ MAX leaves", () => {
      const detected = detectPackIntent({
        brief: "Create 10 social posts for our launch week",
      });
      expect(detected?.isPack).toBe(true);
      expect(detected?.requestedCount).toBe(10);

      const plan = planMultiDeliverablePack({
        brief: "Create 10 social posts for our launch week",
        createId: (p) => `${p}_1`,
      });
      expect(plan?.leafCount).toBe(10);
      expect(plan?.leaves[0]?.prompt).toMatch(/Pack leaf 1 of 10/);
    });

    it("on mode stamps continuityPack + multiDeliverable; thin path keeps it", () => {
      const out = runPackPlannerOnCreate({
        brief: "Make 3 Instagram posts about the sale",
        organizationId: "org",
        metadata: { brandId: "brand_a4", service: "social" },
        rollout: "on",
        createId: (p) => `${p}_1`,
      });
      expect(out?.applied).toBe(true);
      expect(out?.metadata.continuityPack).toBe(true);
      expect(out?.metadata.multiDeliverable).toMatchObject({
        leafCount: 3,
        activeLeafIndex: 0,
      });

      const thin = applyDirectPassthroughMetadata(out!.metadata);
      expect(thin.multiDeliverable).toBeDefined();
      expect(thin.thinOsPath).toBe(true);
    });

    it("shadow mode does not stamp live pack markers", () => {
      const out = runPackPlannerOnCreate({
        brief: "Make 3 Instagram posts about the sale",
        organizationId: "org",
        rollout: "shadow",
        createId: (p) => `${p}_1`,
      });
      expect(out?.metadata.packPlanShadow).toBeDefined();
      expect(out?.metadata.continuityPack).toBeUndefined();
      expect(out?.metadata.multiDeliverable).toBeUndefined();
    });

    it("thin path still strips multiDeliverable without continuityPack stamp", () => {
      const thin = applyDirectPassthroughMetadata({
        multiDeliverable: { leafCount: 5 },
        brandId: "x",
      });
      expect(thin.multiDeliverable).toBeUndefined();
    });
  });

  describe("brief assist", () => {
    it("defaults to off and ignores vague briefs without opt-in", () => {
      expect(resolveBriefAssistRollout({})).toBe("off");
      expect(isBriefEmptyOrVague("logo")).toBe(true);
      expect(clientOptedInBriefAssist({})).toBe(false);
      expect(
        runBriefAssist({
          brief: "logo",
          organizationId: "org",
          metadata: {},
          rollout: "on",
        })?.needsAssist
      ).toBe(false);
    });

    it("opt-in + vague + on → block generate with questions", () => {
      const result = runBriefAssist({
        brief: "make something",
        organizationId: "org",
        metadata: { optInBriefAssist: true, service: "social", brandId: "b1" },
        rollout: "on",
      });
      expect(result?.needsAssist).toBe(true);
      expect(result?.blockGenerate).toBe(true);
      expect(result?.questions.length).toBeGreaterThan(0);
      expect(buildBriefAssistQuestions({ service: "social" })[0]?.id).toBe(
        "audience"
      );
    });

    it("shadow never blocks generate", () => {
      const result = runBriefAssist({
        brief: "",
        organizationId: "org",
        metadata: { optInBriefAssist: true },
        rollout: "shadow",
      });
      expect(result?.needsAssist).toBe(true);
      expect(result?.blockGenerate).toBe(false);
    });
  });

  describe("model router sharpening", () => {
    it("never invents a brief field; inherits refine-reuse pins", () => {
      const { metadata, pins } = sharpenContinuityRoutingPins({
        metadata: {
          preferredProviderId: "prov_a",
          preferredModelId: "mod_a",
          continuityRefineReuse: true,
        },
        refineReuse: true,
      });
      expect(pins.source).toBe("refine_reuse");
      expect(metadata.preferredProviderId).toBe("prov_a");
      expect(metadata.prompt).toBeUndefined();
      expect(metadata.enrichedPrompt).toBeUndefined();
    });

    it("client pins win over refine reuse", () => {
      const { pins } = sharpenContinuityRoutingPins({
        metadata: { preferredProviderId: "old" },
        reqProviderId: "client_prov",
        refineReuse: true,
      });
      expect(pins.source).toBe("client");
      expect(pins.preferredProviderId).toBe("client_prov");
    });
  });
});
