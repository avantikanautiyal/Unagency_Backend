/**
 * Track A — brand profile fact merge tests (no Mongo).
 */

import {
  brandProfileFromFacts,
  mergeProfileFactsIntoResolve,
} from "../../../../src/platform/os/creative/brand-profile-facts";
import type { BrandContextFact } from "../../../../src/platform/os/creative/brand-context-packet";
import type { KnowledgeResolveResult } from "../../../../src/platform/os/creative/knowledge-resolver";

describe("brand-profile-facts merge", () => {
  const emptyResolve: KnowledgeResolveResult = {
    resolved: [],
    missingRequiredSlots: [],
    assets: [],
    facts: [],
    negatives: [],
    provenanceParts: [],
  };

  it("fills gaps from profile without overwriting slot facts", () => {
    const slotFact: BrandContextFact = {
      key: "positioning",
      value: "From approved logo slot",
      tier: "canonical",
      provenance: "Logo v2",
    };
    const profileFacts: BrandContextFact[] = [
      {
        key: "brandName",
        value: "Northstar",
        tier: "canonical",
        provenance: "Brand profile",
      },
      {
        key: "positioning",
        value: "Should not win",
        tier: "canonical",
        provenance: "Brand profile",
      },
      {
        key: "brandSummary",
        value: "Heritage outdoor brand",
        tier: "canonical",
        provenance: "Brand profile",
      },
    ];
    const merged = mergeProfileFactsIntoResolve(
      { ...emptyResolve, facts: [slotFact] },
      profileFacts
    );
    expect(merged.facts.find((f) => f.key === "positioning")?.value).toBe(
      "From approved logo slot"
    );
    expect(merged.facts.some((f) => f.key === "brandName")).toBe(true);
    expect(merged.facts.some((f) => f.key === "brandSummary")).toBe(true);
    expect(merged.provenanceParts).toContain("Brand profile");
  });

  it("brandProfileFromFacts maps keys for job object", () => {
    const profile = brandProfileFromFacts([
      {
        key: "brandName",
        value: "Acme",
        tier: "canonical",
        provenance: "Brand profile",
      },
      {
        key: "brandSummary",
        value: "Playful fintech",
        tier: "canonical",
        provenance: "Brand profile",
      },
    ]);
    expect(profile.brandName).toBe("Acme");
    expect(profile.brandSummary).toBe("Playful fintech");
  });
});
