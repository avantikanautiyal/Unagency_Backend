/**
 * Track A Phase 0 — Smart Continuity contract tests.
 * No create-path integration; stubs + budgets + intent rules only.
 */

import {
  BRAND_CONTEXT_PACKET_BUDGETS,
  BRAND_MEMORY_SLOT_KEYS,
  CONTINUITY_LAYER_FLAGS,
  continuityLayerAffectsGeneration,
  detectIntentGateFromBrief,
  emptyBrandContextPacket,
  estimateFactCardTokens,
  getContinuityLayerFlag,
  validateBrandContextPacketBudgets,
} from "../../../../src/platform/os/creative";

describe("Track A Phase 0 continuity contracts", () => {
  it("exposes canonical slot keys", () => {
    expect(BRAND_MEMORY_SLOT_KEYS).toContain("logo");
    expect(BRAND_MEMORY_SLOT_KEYS).toContain("colors");
    expect(BRAND_MEMORY_SLOT_KEYS).toContain("productHero");
  });

  it("keeps all continuity layers off by default", () => {
    for (const flag of CONTINUITY_LAYER_FLAGS) {
      expect(flag.rollout).toBe("off");
      expect(continuityLayerAffectsGeneration(flag.rollout)).toBe(false);
    }
    expect(getContinuityLayerFlag("ContextBinder")?.rollout).toBe("off");
  });

  it("enforces BrandContextPacket budgets", () => {
    const ok = emptyBrandContextPacket("brand_1");
    expect(validateBrandContextPacketBudgets(ok)).toEqual([]);

    const tooManyFacts = {
      ...ok,
      facts: Array.from({ length: BRAND_CONTEXT_PACKET_BUDGETS.maxFacts + 1 }, (_, i) => ({
        key: `k${i}`,
        value: "x",
        tier: "canonical" as const,
        provenance: "test",
      })),
    };
    expect(validateBrandContextPacketBudgets(tooManyFacts)).toContain(
      "too_many_facts"
    );
  });

  it("estimates fact-card tokens for budget checks", () => {
    const tokens = estimateFactCardTokens(
      [{ key: "voice", value: "warm and direct", tier: "canonical", provenance: "g" }],
      [{ text: "never say cheap", source: "guidelines" }]
    );
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(BRAND_CONTEXT_PACKET_BUDGETS.maxFactTokens);
  });

  it("maps structured logoRole reuse without rewriting the brief (L1)", () => {
    const brief = "Make an Instagram post and use our logo";
    const result = detectIntentGateFromBrief(brief, {
      logoRole: "reuse_canonical",
      service: "social",
    });
    expect(result.briefUnchanged).toBe(true);
    expect(result.intentTags).toContain("reuse_logo");
    expect(result.requiredSlots).toContain("logo");
  });

  it("maps logo-design service to new_mark without brief regex", () => {
    const neu = detectIntentGateFromBrief("Design a new logo for our chai brand", {
      service: "branding",
      subtype: "logo-design",
    });
    expect(neu.intentTags).toContain("new_mark");
    expect(neu.requiredSlots).not.toContain("logo");
  });

  it("treats Create a logo + colour theme as new mark via service prior", () => {
    const r = detectIntentGateFromBrief(
      "Create a logo for our brand. It is a sports car manufacturing brand. The colour theme should be silver blue and metallic red.",
      { service: "branding", subtype: "logo-design" }
    );
    expect(r.intentTags).toContain("new_mark");
    expect(r.requiredSlots).not.toContain("logo");
    expect(r.requiredSlots).not.toContain("colors");
  });

  it("does not invent color reuse slots from brief text alone", () => {
    const r = detectIntentGateFromBrief(
      "Create a brochure. Use the brand colours: silver, navy and metallic red.",
      { service: "print", subtype: "brochures" }
    );
    expect(r.requiredSlots).not.toContain("colors");
    expect(r.intentTags).not.toContain("reuse_colors");
  });

  it("does not invent color slots from Hindi brief text alone", () => {
    const r = detectIntentGateFromBrief(
      "Brochure banao. Brand rang laal aur neela hon."
    );
    expect(r.requiredSlots).not.toContain("colors");
  });

  it("requires logo when logoRole is reuse_canonical", () => {
    const r = detectIntentGateFromBrief(
      "Make an Instagram post and use our logo",
      { logoRole: "reuse_canonical", service: "social" }
    );
    expect(r.intentTags).toContain("reuse_logo");
    expect(r.requiredSlots).toContain("logo");
  });

  it("stays unspecified for match-campaign phrasing without structured intent", () => {
    const r = detectIntentGateFromBrief(
      "Like last campaign but for Diwali sale posts"
    );
    expect(r.intentTags).toContain("unspecified");
    expect(r.requiredSlots).not.toContain("campaignLook");
  });
});
