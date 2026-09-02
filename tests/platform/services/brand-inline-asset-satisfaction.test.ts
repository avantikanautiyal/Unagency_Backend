import { applyProfileAndMetadataSlotSatisfaction } from "../../../src/services/brand-inline-asset-satisfaction";
import type { KnowledgeResolveResult } from "../../../src/platform/os/creative/knowledge-resolver";

describe("brand-inline-asset-satisfaction", () => {
  const missingLogoVoice: KnowledgeResolveResult = {
    resolved: [],
    missingRequiredSlots: ["logo", "voice"],
    assets: [],
    facts: [],
    negatives: [],
    provenanceParts: [],
  };

  it("satisfies logo from brand profile logoAssetId", () => {
    const resolved = applyProfileAndMetadataSlotSatisfaction({
      resolve: missingLogoVoice,
      profileLogoAssetId: "vault_logo_1",
    });
    expect(resolved.missingRequiredSlots).not.toContain("logo");
    expect(resolved.assets[0]?.assetId).toBe("vault_logo_1");
  });

  it("satisfies logo from prompt attachment assetIds", () => {
    const resolved = applyProfileAndMetadataSlotSatisfaction({
      resolve: missingLogoVoice,
      metadata: { assetIds: ["upload_logo_1"] },
    });
    expect(resolved.missingRequiredSlots).not.toContain("logo");
    expect(resolved.assets[0]?.assetId).toBe("upload_logo_1");
  });

  it("satisfies voice from merged brand profile facts", () => {
    const resolved = applyProfileAndMetadataSlotSatisfaction({
      resolve: missingLogoVoice,
      metadata: { brandTone: "Confident and premium" },
    });
    expect(resolved.missingRequiredSlots).not.toContain("voice");
    expect(resolved.facts.some((f) => f.key === "voice")).toBe(true);
  });

  it("satisfies voice already present in facts", () => {
    const resolved = applyProfileAndMetadataSlotSatisfaction({
      resolve: {
        ...missingLogoVoice,
        facts: [
          {
            key: "voice",
            value: "Playful and warm",
            tier: "canonical",
            provenance: "Brand profile",
          },
        ],
      },
    });
    expect(resolved.missingRequiredSlots).not.toContain("voice");
  });
});
