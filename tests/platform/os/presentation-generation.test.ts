import {
  buildPresentationConceptsInstructionBlock,
  buildPresentationExpansionInstructionBlock,
  buildPresentationRoutesInstructionBlock,
  orderPresentationProviderPrompt,
  validatePresentationConceptsRelevance,
  validatePresentationRoutesRelevance,
} from "../../../src/platform/os/delivery/presentation-generation";
import { PRESENTATION_ROUTE_CONCEPTS_SCHEMA } from "../../../src/platform/os/delivery/presentation-schemas";

const divastraBrief = `Create a modern corporate presentation for DiVastra, a retail e-commerce startup
specializing in ethnic fashion for women aged 15-65. Include brand introduction, growth strategy,
digital customer acquisition, white beige peach color palette.`;

describe("validatePresentationConceptsRelevance", () => {
  it("rejects off-brief concepts", () => {
    const result = validatePresentationConceptsRelevance({
      data: {
        concepts: [
          { title: "Culinary Innovations", description: "Food services", narrativeAngle: "Flavor" },
          { title: "Green Future", description: "Sustainability", narrativeAngle: "Eco" },
          { title: "Digital Shift", description: "Tech reshape", narrativeAngle: "Cloud" },
        ],
      },
      userBrief: divastraBrief,
      brandName: "DiVastra",
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildPresentationConceptsInstructionBlock", () => {
  it("asks for concepts only without slides", () => {
    const block = buildPresentationConceptsInstructionBlock({
      userBrief: divastraBrief,
      brandName: "DiVastra",
      subtype: "corporate",
    });
    expect(block).toContain("Phase A");
    expect(block).toContain("Do NOT write slides");
    expect(block).toContain("DiVastra");
  });
});

describe("buildPresentationExpansionInstructionBlock", () => {
  it("locks validated concepts for phase B", () => {
    const concepts = {
      concepts: [
        { title: "Heritage Modern", description: "DiVastra ethnic fashion", narrativeAngle: "Peach editorial" },
        { title: "Growth Engine", description: "DiVastra digital acquisition", narrativeAngle: "E-commerce journey" },
        { title: "Brand World", description: "DiVastra palette", narrativeAngle: "Beige peach" },
      ],
    };
    const block = buildPresentationExpansionInstructionBlock({
      lockedConcepts: concepts,
      brandName: "DiVastra",
      subtype: "corporate",
    });
    expect(block).toContain("Phase B");
    expect(block).toContain("Heritage Modern");
    expect(block).toContain("Do NOT change concept titles");
  });
});

describe("orderPresentationProviderPrompt", () => {
  it("places non-negotiables after body", () => {
    const ordered = orderPresentationProviderPrompt({
      body: "Middle context block",
      brandName: "DiVastra",
      userBrief: divastraBrief,
      subtype: "corporate",
    });
    expect(ordered.indexOf("[Role — corporate presentation director]")).toBeLessThan(
      ordered.indexOf("Middle context block")
    );
    expect(ordered.indexOf("Middle context block")).toBeLessThan(
      ordered.indexOf("[Non-negotiables — read last, obey first]")
    );
  });
});

describe("presentation schemas", () => {
  it("concepts schema is lighter than full routes", () => {
    expect(JSON.stringify(PRESENTATION_ROUTE_CONCEPTS_SCHEMA).length).toBeLessThan(800);
  });
});

describe("validatePresentationRoutesRelevance", () => {
  it("rejects generic off-brief culinary/sustainability routes", () => {
    const result = validatePresentationRoutesRelevance({
      data: {
        routes: [
          {
            title: "Sustainable Innovations",
            description: "Eco-friendly products",
            deckTitle: "Green Visions",
            deckSubtitle: "Pioneering a Sustainable Future",
            slides: [{ title: "Green", bullets: ["Eco", "Green"], layout: "content_bullets", notes: "", visualCue: "trees" }],
          },
          {
            title: "Digital Transformation",
            description: "Technology reshape industries",
            deckTitle: "Transforming Tomorrow",
            deckSubtitle: "Digital Revolution",
            slides: [{ title: "Tech", bullets: ["AI", "Cloud"], layout: "content_bullets", notes: "", visualCue: "servers" }],
          },
          {
            title: "Culinary Innovations",
            description: "Food services",
            deckTitle: "Flavor Fusion",
            deckSubtitle: "Future of food",
            slides: [{ title: "Food", bullets: ["Flavor", "Fusion"], layout: "content_bullets", notes: "", visualCue: "kitchen" }],
          },
        ],
      },
      userBrief: divastraBrief,
      brandName: "DiVastra",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("off_topic"))).toBe(true);
    expect(result.reasons).toContain("missing_brand_name");
  });

  it("accepts on-brief DiVastra corporate routes", () => {
    const result = validatePresentationRoutesRelevance({
      data: {
        routes: [
          {
            title: "Heritage Modern",
            description: "DiVastra ethnic fashion positioning",
            deckTitle: "DiVastra — Brand & Strategy",
            deckSubtitle: "Ethnic fashion for every generation",
            slides: [
              {
                title: "DiVastra at a glance",
                bullets: ["Ethnic fashion e-commerce", "Women 15-65", "Growth strategy"],
                layout: "title_hero",
                notes: "",
                visualCue: "peach beige palette",
              },
            ],
          },
          {
            title: "Growth Engine",
            description: "Digital acquisition for DiVastra",
            deckTitle: "DiVastra Growth Strategy",
            deckSubtitle: "Scaling ethnic fashion online",
            slides: [
              {
                title: "Customer acquisition",
                bullets: ["Digital channels", "Partnerships", "Personalization"],
                layout: "content_bullets",
                notes: "",
                visualCue: "e-commerce journey",
              },
            ],
          },
          {
            title: "Visual Story",
            description: "Brand world for DiVastra",
            deckTitle: "DiVastra Brand World",
            deckSubtitle: "White, beige, and peach",
            slides: [
              {
                title: "Palette & voice",
                bullets: ["White beige peach", "Empowering women", "Cultural heritage"],
                layout: "key_message",
                notes: "",
                visualCue: "fashion editorial",
              },
            ],
          },
        ],
      },
      userBrief: divastraBrief,
      brandName: "DiVastra",
    });
    expect(result.ok).toBe(true);
  });
});

describe("buildPresentationRoutesInstructionBlock", () => {
  it("includes brand lock and corporate subtype guidance", () => {
    const block = buildPresentationRoutesInstructionBlock({
      userBrief: divastraBrief,
      brandName: "DiVastra",
      subtype: "corporate",
      exampleDeliverable: "Corporate profile or company presentation",
    });
    expect(block).toContain("DiVastra");
    expect(block).toContain("SAME client brief");
    expect(block).toContain("Corporate company profile");
    expect(block).not.toContain("JSON Schema");
  });
});
