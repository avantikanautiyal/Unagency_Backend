import { verifyAndReinforcePresentationOutput } from "../../../src/services/presentation-verify-reinforce";
import {
  extractPresentationMustUseFacts,
  validatePresentationMustUseCoverage,
} from "../../../src/platform/os/delivery/presentation-generation";

const divastraBrief =
  "DiVastra ethnic fashion e-commerce growth strategy peach beige palette women 15-65";

describe("presentation must-use constraints", () => {
  it("extracts brand and brief anchors", () => {
    const facts = extractPresentationMustUseFacts({
      userBrief: divastraBrief,
      brandName: "DiVastra",
      metadata: { brandColors: ["#F5E6D3", "peach"] },
    });
    expect(facts.some((f) => f.key === "brand" && f.value === "DiVastra")).toBe(true);
    expect(facts.length).toBeGreaterThan(2);
  });

  it("validates must-use coverage in deck output", () => {
    const facts = extractPresentationMustUseFacts({
      userBrief: divastraBrief,
      brandName: "DiVastra",
    });
    const ok = validatePresentationMustUseCoverage({
      data: {
        routes: [
          {
            title: "Heritage Modern",
            deckTitle: "DiVastra Strategy",
            description: "Ethnic fashion growth",
            slides: [
              {
                title: "DiVastra ethnic fashion",
                bullets: ["e-commerce", "growth strategy", "peach palette"],
                layout: "content_bullets",
                notes: "",
                visualCue: "beige peach editorial",
              },
            ],
          },
        ],
      },
      facts,
    });
    expect(ok.ok).toBe(true);
  });
});

describe("verifyAndReinforcePresentationOutput", () => {
  it("passes on-brief structured routes and returns grounding labels", async () => {
    const facts = extractPresentationMustUseFacts({
      userBrief: divastraBrief,
      brandName: "DiVastra",
    });
    const result = await verifyAndReinforcePresentationOutput({
      organizationId: "507f1f77bcf86cd799439011",
      structured: {
        routes: [
          {
            title: "Heritage Modern",
            deckTitle: "DiVastra — Brand Strategy",
            description: "Ethnic fashion for DiVastra",
            deckSubtitle: "Growth and palette",
            slides: [
              {
                title: "DiVastra overview",
                bullets: ["ethnic fashion", "e-commerce", "peach palette"],
                layout: "title_hero",
                notes: "",
                visualCue: "peach beige",
              },
            ],
          },
        ],
      },
      userBrief: divastraBrief,
      brandName: "DiVastra",
      metadata: { presentationMustUseFacts: facts },
    });
    expect(result.passed).toBe(true);
    expect(result.meta.grounding).toContain("DiVastra");
  });
});
