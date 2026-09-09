/**
 * Phase 0 — Format & Production Spec contract freeze.
 * Types, prompt-block builder, universal gates, productionRuleId binding.
 * No prompt-pipeline wiring (Phase 1).
 */

import {
  ALL_UNIVERSAL_GATE_IDS,
  FORMAT_PRODUCTION_SPEC_EDITION,
  FORMAT_PRODUCTION_SPEC_PROVENANCE,
  PRODUCTION_PROMPT_BLOCK_HEADER,
  PRODUCTION_PROMPT_BLOCK_VERSION,
  PRODUCTION_SPEC_BINDING_METADATA_KEY,
  PRODUCTION_SPEC_STACK_PROVENANCE,
  SERVICE_HYGIENE_REFERENCE_DOC_DATE,
  SERVICE_HYGIENE_REFERENCE_EDITION,
  SERVICE_HYGIENE_REFERENCE_PROVENANCE,
  UNIVERSAL_RELEASE_GATES,
  buildProductionPromptBlock,
  buildProductionPromptBlockText,
  buildProductionSpecBindingFromResolved,
  freezeProductionSpecBinding,
  getProductionRuleById,
  getUniversalReleaseGate,
  isProductionSpecBinding,
  readProductionSpecBinding,
  resolveProductionRule,
  resolveUniversalReleaseGates,
  withProductionSpecBinding,
} from "../../../src/platform/config/format-production-spec";
import { hygieneCheck, rule } from "../../../src/platform/config/format-production-spec/rules/helpers";
import type { ProductionRule } from "../../../src/platform/config/format-production-spec/types";

function fixtureRule(
  overrides: Partial<ProductionRule> &
    Pick<ProductionRule, "id" | "placement" | "status"> = {
    id: "test.social.fixture",
    placement: "feed.portrait",
    status: "D",
  },
): ProductionRule {
  return rule({
    service: "social",
    subtype: "content-design",
    platform: "instagram",
    canvas: { width: 1080, height: 1350, unit: "px" },
    colour: "sRGB",
    export: {
      formats: ["png", "jpg"],
      notes: "sRGB digital still",
    },
    productionNote: "House editorial master for tests.",
    beforeCreateChecks: Object.freeze([
      "Name the exact intended placement; never approve an asset for “All”.",
    ]),
    howToCreate: Object.freeze([
      "Check current platform overlay before release.",
    ]),
    ...overrides,
  });
}

describe("Phase 0 — edition / hygiene provenance", () => {
  it("keeps format-spec provenance stable for existing consumers", () => {
    expect(FORMAT_PRODUCTION_SPEC_EDITION).toBe("1.0.0");
    expect(FORMAT_PRODUCTION_SPEC_PROVENANCE).toBe("format-spec@1.0.0");
  });

  it("pins Service & Hygiene Reference identity", () => {
    expect(SERVICE_HYGIENE_REFERENCE_EDITION).toBe("1.0");
    expect(SERVICE_HYGIENE_REFERENCE_DOC_DATE).toBe("2026-09-05");
    expect(SERVICE_HYGIENE_REFERENCE_PROVENANCE).toBe("hygiene-ref@1.0");
    expect(PRODUCTION_SPEC_STACK_PROVENANCE).toBe(
      "format-spec@1.0.0+hygiene-ref@1.0+visual-field-guide@1.0",
    );
  });
});

describe("Phase 0 — universal release gates", () => {
  it("exposes all nine HYGIENE 01 gates as Gate weight", () => {
    expect(UNIVERSAL_RELEASE_GATES).toHaveLength(9);
    expect(ALL_UNIVERSAL_GATE_IDS).toEqual([
      "brief",
      "identity",
      "copy",
      "rights",
      "technical",
      "readability",
      "destination",
      "source_package",
      "approval",
    ]);
    for (const g of UNIVERSAL_RELEASE_GATES) {
      expect(g.weight).toBe("gate");
      expect(g.passDefinition.length).toBeGreaterThan(0);
      expect(g.promptLine.length).toBeGreaterThan(0);
    }
  });

  it("resolves full catalog when gate ids omitted", () => {
    expect(resolveUniversalReleaseGates()).toHaveLength(9);
    expect(resolveUniversalReleaseGates([])).toHaveLength(9);
  });

  it("resolves a stable subset without duplicates", () => {
    const subset = resolveUniversalReleaseGates([
      "identity",
      "technical",
      "identity",
    ]);
    expect(subset.map((g) => g.id)).toEqual(["identity", "technical"]);
    expect(getUniversalReleaseGate("technical")?.evaluationMethod).toBe(
      "MEASURED",
    );
  });
});

describe("Phase 0 — hygieneCheck / ProductionRule shape", () => {
  it("authors frozen structured hygiene checks", () => {
    const check = hygieneCheck({
      id: "safe-zones",
      weight: "gate",
      passDefinition: "Logo and CTA clear of platform overlays.",
      promptLine: "Keep logo, copy, and CTA clear of platform UI overlays.",
      evaluationMethod: "HEURISTIC",
    });
    expect(Object.isFrozen(check)).toBe(true);
    expect(check.evaluationMethod).toBe("HEURISTIC");
  });

  it("defaults evaluationMethod to NOT_AUTOMATED", () => {
    const check = hygieneCheck({
      id: "brand-upfront",
      weight: "weighted",
      passDefinition: "Brand visible in first second.",
      promptLine: "Identify brand within the first second of short social video.",
    });
    expect(check.evaluationMethod).toBe("NOT_AUTOMATED");
  });

  it("freezes hygieneChecks and universalGateIds on rule()", () => {
    const r = fixtureRule({
      id: "test.with.hygiene",
      placement: "reels",
      status: "D",
      hygieneChecks: [
        hygieneCheck({
          id: "safe-zones",
          weight: "gate",
          passDefinition: "Clear of overlays.",
          promptLine: "Respect safe zones.",
        }),
      ],
      universalGateIds: ["identity", "technical"],
    });
    expect(Object.isFrozen(r.hygieneChecks)).toBe(true);
    expect(Object.isFrozen(r.universalGateIds)).toBe(true);
    expect(r.hygieneChecks?.[0]?.id).toBe("safe-zones");
  });
});

describe("Phase 0 — buildProductionPromptBlock", () => {
  it("builds a deterministic block with required shape for catalog rules", () => {
    const resolved = resolveProductionRule({
      placementId: "instagram.feed.portrait",
    });
    expect(resolved).toBeDefined();
    const block = buildProductionPromptBlock({ rule: resolved!.rule });

    expect(block.version).toBe(PRODUCTION_PROMPT_BLOCK_VERSION);
    expect(block.productionRuleId).toBe(resolved!.rule.id);
    expect(block.edition).toBe(FORMAT_PRODUCTION_SPEC_EDITION);
    expect(block.provenance).toBe(PRODUCTION_SPEC_STACK_PROVENANCE);
    expect(block.authorityStatus).toBe("D");
    expect(block.contentHash).toMatch(/^[a-f0-9]{16}$/);
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.sections)).toBe(true);

    expect(block.text).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(block.text).toContain(PRODUCTION_SPEC_STACK_PROVENANCE);
    expect(block.text).toContain("Canvas: 1080×1350 px");
    expect(block.text).toContain("aspect 4:5");
    expect(block.hardConstraintLines.length).toBeGreaterThanOrEqual(9);
    // Platform field cards may lack checklist strings until Phase 2; universal
    // gates still populate hardConstraintLines.
    expect(Array.isArray(block.softTargetLines)).toBe(true);

    const sectionIds = block.sections.map((s) => s.id);
    expect(sectionIds).toContain("header");
    expect(sectionIds).toContain("placement");
    expect(sectionIds).toContain("canvas");
    expect(sectionIds).toContain("authority");
    expect(sectionIds).toContain("identity_system");
    expect(sectionIds).toContain("service_visual_recipe");
    expect(sectionIds).toContain("universal_gates");
  });

  it("is stable across repeated builds (same contentHash)", () => {
    const rule = getProductionRuleById("instagram.reels");
    expect(rule).toBeDefined();
    const a = buildProductionPromptBlock({ rule: rule! });
    const b = buildProductionPromptBlock({ rule: rule! });
    expect(a.text).toBe(b.text);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("prefers structured hygiene for hard/soft lines", () => {
    const r = fixtureRule({
      id: "test.structured",
      placement: "stories",
      status: "D",
      hygieneChecks: [
        hygieneCheck({
          id: "safe-zones",
          weight: "gate",
          passDefinition: "Clear of overlays.",
          promptLine: "Keep essential content clear of Stories UI chrome.",
          evaluationMethod: "HEURISTIC",
        }),
        hygieneCheck({
          id: "brand-upfront",
          weight: "weighted",
          passDefinition: "Brand in first second.",
          promptLine: "Show brand identity within the first second.",
        }),
      ],
      universalGateIds: ["technical"],
    });

    const block = buildProductionPromptBlock({ rule: r });
    expect(block.hardConstraintLines).toEqual(
      expect.arrayContaining([
        "Keep essential content clear of Stories UI chrome.",
        expect.stringContaining("canvas size"),
      ]),
    );
    expect(block.softTargetLines).toContain(
      "Show brand identity within the first second.",
    );
    // Checklist strings remain as sections, but are not duplicated into soft
    // lines when structured hygiene is present.
    expect(block.softTargetLines).not.toContain(
      "Name the exact intended placement; never approve an asset for “All”.",
    );
    expect(block.sections.some((s) => s.id === "hard_gates")).toBe(true);
    expect(block.sections.some((s) => s.id === "weighted_targets")).toBe(true);
    expect(block.sections.find((s) => s.id === "universal_gates")?.lines).toHaveLength(
      1,
    );
  });

  it("falls back checklist strings into soft targets when hygieneChecks absent", () => {
    const r = fixtureRule({
      id: "test.fallback",
      placement: "feed.square",
      status: "D",
    });
    const block = buildProductionPromptBlock({ rule: r });
    expect(block.sections.some((s) => s.id === "hard_gates")).toBe(false);
    expect(block.softTargetLines).toEqual(
      expect.arrayContaining([
        "Name the exact intended placement; never approve an asset for “All”.",
        "Check current platform overlay before release.",
      ]),
    );
  });

  it("respects maxWeightedLines without capping gates", () => {
    const r = fixtureRule({
      id: "test.cap",
      placement: "reels",
      status: "V",
      sourceRef: "[S-TEST]",
      hygieneChecks: [
        hygieneCheck({
          id: "g1",
          weight: "gate",
          passDefinition: "g1",
          promptLine: "Gate one",
        }),
        hygieneCheck({
          id: "w1",
          weight: "weighted",
          passDefinition: "w1",
          promptLine: "Weighted one",
        }),
        hygieneCheck({
          id: "w2",
          weight: "weighted",
          passDefinition: "w2",
          promptLine: "Weighted two",
        }),
      ],
      universalGateIds: [],
    });

    const block = buildProductionPromptBlock({
      rule: r,
      maxWeightedLines: 1,
      includeUniversalGates: false,
    });
    expect(block.hardConstraintLines).toEqual(["Gate one"]);
    expect(block.softTargetLines).toEqual(["Weighted one"]);
    expect(block.text).toContain("Authority: V ([S-TEST])");
    expect(block.sections.some((s) => s.id === "universal_gates")).toBe(false);
  });

  it("exposes text helper matching block.text", () => {
    const r = fixtureRule({
      id: "test.text",
      placement: "default",
      status: "R",
    });
    expect(buildProductionPromptBlockText({ rule: r })).toBe(
      buildProductionPromptBlock({ rule: r }).text,
    );
  });

  it("includes export and technical lines when present", () => {
    const r = fixtureRule({
      id: "test.printish",
      service: "print",
      subtype: "brochures",
      placement: "default",
      status: "D",
      canvas: { width: 210, height: 297, unit: "mm" },
      colour: "CMYK",
      print: { bleedMm: 3, effectivePpi: 300 },
      export: { formats: ["pdf"], notes: "Print PDF with bleed" },
    });
    const block = buildProductionPromptBlock({ rule: r });
    expect(block.text).toContain("Export formats: pdf");
    expect(block.text).toContain("Colour space: CMYK");
    expect(block.text).toContain("Print bleed starting point: 3 mm");
    expect(block.text).toContain("Effective PPI target: 300");
    expect(block.text).not.toMatch(/aspect /);
  });
});

describe("Phase 0 — productionSpecBinding contract", () => {
  it("freezes a complete binding from resolved rule", () => {
    const resolved = resolveProductionRule({
      service: "email",
      subtype: "emailers",
    });
    expect(resolved).toBeDefined();
    const binding = buildProductionSpecBindingFromResolved(resolved!, {
      promptBlockHash: "abc123",
      boundAt: "2026-09-05T00:00:00.000Z",
    });

    expect(Object.isFrozen(binding)).toBe(true);
    expect(binding.productionRuleId).toBe(resolved!.rule.id);
    expect(binding.edition).toBe("1.0.0");
    expect(binding.formatProvenance).toBe("format-spec@1.0.0");
    expect(binding.hygieneProvenance).toBe("hygiene-ref@1.0");
    expect(binding.visualGuideProvenance).toBe("visual-field-guide@1.0");
    expect(binding.stackProvenance).toBe(PRODUCTION_SPEC_STACK_PROVENANCE);
    expect(binding.authorityStatus).toBe("D");
    expect(binding.matchedBy).toBe("serviceDefault");
    expect(binding.promptBlockHash).toBe("abc123");
    expect(isProductionSpecBinding(binding)).toBe(true);
  });

  it("reads and merges binding on metadata without mutation", () => {
    const binding = freezeProductionSpecBinding({
      ruleId: "instagram.feed.portrait",
      authorityStatus: "D",
      matchedBy: "placementId",
    });
    const base = Object.freeze({ foo: 1 });
    const next = withProductionSpecBinding(base, binding);

    expect(base).not.toHaveProperty(PRODUCTION_SPEC_BINDING_METADATA_KEY);
    expect(next.foo).toBe(1);
    expect(next.productionRuleId).toBe("instagram.feed.portrait");
    expect(next.productionSpecProvenance).toBe(PRODUCTION_SPEC_STACK_PROVENANCE);
    expect(readProductionSpecBinding(next)?.productionRuleId).toBe(
      "instagram.feed.portrait",
    );
    expect(readProductionSpecBinding({ foo: 1 })).toBeUndefined();
    expect(isProductionSpecBinding({ productionRuleId: "" })).toBe(false);
  });
});
