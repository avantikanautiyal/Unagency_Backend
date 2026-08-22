/**
 * Phase 1 — Brief Intelligence unit + validation tests.
 */

import {
  createBriefIntelligenceEngine,
  classifyBriefIntent,
  validateStructuredBrief,
  BriefIntelligenceError,
  STRUCTURED_BRIEF_VERSION,
  type StructuredBrief,
} from "../../../src/platform/os/brief";
import {
  extractDeliverables,
  extractChannels,
  extractAudience,
  mapBriefCapabilities,
  detectMissingInformation,
  extractDimensions,
  extractTone,
} from "../../../src/platform/os/brief/engine/extractors";

describe("Phase 1 — intent classification", () => {
  it("classifies campaign", () => {
    const r = classifyBriefIntent({
      prompt: "Create a product launch campaign with Instagram content and a landing page.",
    });
    expect(r.kind).toBe("campaign");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("classifies landing page", () => {
    expect(classifyBriefIntent({ prompt: "Design a landing page for our SaaS trial." }).kind).toBe(
      "landing_page"
    );
  });

  it("classifies website", () => {
    expect(classifyBriefIntent({ prompt: "Build me a website." }).kind).toBe("website");
  });

  it("classifies social content / caption without over-ambiguity", () => {
    const r = classifyBriefIntent({ prompt: "Write a caption for this product." });
    expect(r.kind).toBe("social_content");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("marks weak prompts as other/low confidence", () => {
    const r = classifyBriefIntent({ prompt: "Do the thing." });
    expect(r.kind).toBe("other");
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("derives intent from client capability when prompt is weak", () => {
    const r = classifyBriefIntent({
      prompt: "Do the thing.",
      clientCapabilityId: "image.generate",
    });
    expect(r.kind).toBe("image");
  });
});

describe("Phase 1 — deliverables / requirements / capabilities", () => {
  const createId = (p: string) => `${p}_1`;

  it("extracts multiple deliverables with channels", () => {
    const prompt =
      "Create a product launch campaign with Instagram content and a landing page.";
    const channels = extractChannels(prompt);
    const { deliverables } = extractDeliverables({
      prompt,
      intent: "campaign",
      channels,
      createId,
    });
    const types = deliverables.map((d) => d.type);
    expect(types).toEqual(
      expect.arrayContaining(["campaign_strategy", "instagram_content", "landing_page"])
    );
    expect(deliverables.find((d) => d.type === "instagram_content")?.channel).toBe(
      "instagram"
    );
  });

  it("extracts quantity for Instagram posts", () => {
    const prompt = "Create 5 Instagram posts for the launch.";
    const { deliverables } = extractDeliverables({
      prompt,
      intent: "social_content",
      channels: extractChannels(prompt),
      createId,
    });
    expect(deliverables.find((d) => d.type === "instagram_content")?.quantity).toBe(5);
  });

  it("extracts dimensions, audience, tone", () => {
    const prompt =
      "Create a 1080x1080 Instagram ad with premium tone for Gen Z.";
    expect(extractDimensions(prompt)).toBe("1080x1080");
    expect(extractAudience(prompt)?.toLowerCase()).toMatch(/gen\s*z/);
    expect(extractTone(prompt)).toBe("premium");
  });

  it("maps campaign deliverables to text.generate capability", () => {
    const caps = mapBriefCapabilities({
      intent: "campaign",
      deliverables: [
        {
          id: "d1",
          type: "campaign_strategy",
          description: "x",
          required: true,
          provenance: "USER",
        },
        {
          id: "d2",
          type: "landing_page",
          description: "x",
          required: true,
          provenance: "USER",
        },
      ],
    });
    expect(caps.some((c) => c.capabilityId === "text.generate" && c.role === "primary")).toBe(
      true
    );
  });

  it("honors client capability as primary", () => {
    const caps = mapBriefCapabilities({
      intent: "image",
      deliverables: [
        {
          id: "d1",
          type: "image",
          description: "img",
          required: true,
          provenance: "USER",
        },
      ],
      clientCapabilityId: "image.generate",
    });
    expect(caps.find((c) => c.role === "primary")?.capabilityId).toBe("image.generate");
  });
});

describe("Phase 1 — missing information / simple requests", () => {
  it("flags incomplete website", () => {
    const { missing } = detectMissingInformation({
      prompt: "Build me a website.",
      intent: "website",
      deliverables: [],
    });
    expect(missing.some((m) => m.key === "website_purpose" && m.severity === "required")).toBe(
      true
    );
  });

  it("does not over-block a simple caption via engine", () => {
    const eng = createBriefIntelligenceEngine();
    const brief = eng.createBrief({
      tenant: {
        organizationId: "org_1",
        requestId: "r1",
        executionId: "e1",
      },
      rawPrompt: "Write a caption for this product.",
    });
    expect(brief.status).not.toBe("NEEDS_INFORMATION");
    expect(brief.missingInformation.every((m) => m.severity !== "required")).toBe(true);
    expect(brief.deliverables.some((d) => d.type === "caption")).toBe(true);
  });

  it("records provenance for user-supplied audience", () => {
    const eng = createBriefIntelligenceEngine();
    const brief = eng.createBrief({
      tenant: {
        organizationId: "org_1",
        requestId: "r1",
        executionId: "e1",
      },
      rawPrompt: "Write Instagram copy for Gen Z about iced coffee.",
    });
    expect(brief.audience?.toLowerCase()).toMatch(/gen\s*z/);
    expect(brief.provenance.some((p) => p.field === "audience" && p.source === "USER")).toBe(
      true
    );
  });

  it("records brand-context assumption when brandId present", () => {
    const eng = createBriefIntelligenceEngine();
    const brief = eng.createBrief({
      tenant: {
        organizationId: "org_1",
        requestId: "r1",
        executionId: "e1",
      },
      rawPrompt: "Write a product launch caption.",
      availableContext: { brandId: "brand_abc" },
    });
    expect(
      brief.assumptions.some(
        (a) => a.source === "BRAND_CONTEXT" && a.statement.includes("brand_abc")
      )
    ).toBe(true);
  });
});

describe("Phase 1 — validation fails closed", () => {
  const base = (): StructuredBrief => ({
    id: "brief_1",
    version: STRUCTURED_BRIEF_VERSION,
    executionId: "e1",
    organizationId: "org_1",
    requestId: "r1",
    sourceRequest: { promptPreview: "hello" },
    intent: { kind: "copy", confidence: 0.9 },
    objective: "hello",
    deliverables: [
      {
        id: "d1",
        type: "copy",
        description: "copy",
        required: true,
        provenance: "USER",
      },
    ],
    channels: [],
    constraints: [],
    requirements: [],
    preferences: [],
    requiredCapabilities: [
      { capabilityId: "text.generate", role: "primary", rationale: "x" },
    ],
    outputRequirements: ["copy"],
    dependencies: [],
    priority: "normal",
    missingInformation: [],
    assumptions: [],
    confidence: { system: 0.8, extraction: 0.9 },
    status: "VALID",
    provenance: [],
    createdAt: new Date().toISOString(),
  });

  it("rejects invalid enum / capability", () => {
    const bad = {
      ...base(),
      requiredCapabilities: [
        { capabilityId: "magic.generate", role: "primary", rationale: "x" },
      ],
    } as unknown as StructuredBrief;
    expect(() => validateStructuredBrief(bad)).toThrow(BriefIntelligenceError);
    try {
      validateStructuredBrief(bad);
    } catch (e) {
      expect((e as BriefIntelligenceError).code).toBe("BRIEF_VALIDATION_FAILED");
    }
  });

  it("rejects invalid confidence", () => {
    const bad = {
      ...base(),
      confidence: { system: 1.5, extraction: 0.5 },
    } as StructuredBrief;
    expect(() => validateStructuredBrief(bad)).toThrow(BriefIntelligenceError);
  });

  it("rejects missing deliverables", () => {
    const bad = { ...base(), deliverables: [] } as StructuredBrief;
    expect(() => validateStructuredBrief(bad)).toThrow(BriefIntelligenceError);
  });
});

describe("Phase 1 — end-to-end campaign brief shape", () => {
  it("produces rich campaign brief for launch NL request", () => {
    const eng = createBriefIntelligenceEngine();
    const brief = eng.createBrief({
      tenant: {
        organizationId: "org_demo",
        requestId: "req_1",
        executionId: "exec_1",
      },
      rawPrompt:
        "Create a product launch campaign with Instagram content and a landing page.",
      createId: (p) => `${p}_fixed`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    expect(brief.status).toBe("VALID");
    expect(brief.intent.kind).toBe("campaign");
    expect(brief.deliverables.map((d) => d.type)).toEqual(
      expect.arrayContaining(["campaign_strategy", "instagram_content", "landing_page"])
    );
    expect(brief.requiredCapabilities.map((c) => c.capabilityId)).toContain("text.generate");
    expect(brief.organizationId).toBe("org_demo");
    expect(brief.executionId).toBe("exec_1");
    expect(brief.version).toBe(STRUCTURED_BRIEF_VERSION);
  });
});
