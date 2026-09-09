/**
 * Phase 6 — Visual Field Guide catalog, prompt inject, measured evidence, vision judge.
 */

import {
  PRODUCTION_SPEC_STACK_PROVENANCE,
  VISUAL_FIELD_GUIDE_EDITION,
  VISUAL_FIELD_GUIDE_PROVENANCE,
  buildProductionGateFromExecutionContext,
  buildProductionPromptBlock,
  buildVisualFieldGuideJudgeRubric,
  evaluateProductionReleaseGate,
  evaluateVisualFieldGuideMeasuredEvidence,
  getProductionRuleById,
  getServiceVisualRecipe,
  listServiceVisualRecipes,
  mergeHygieneEvidenceIds,
  normalizeVisualFieldGuideService,
  resolveProductionRule,
  resolveQcChecklistItems,
  resolveVisualFieldGuide,
  runVisualFieldGuideJudge,
  setVisualFieldGuideJudgeRunner,
} from "../../../src/platform/config/format-production-spec";

describe("Phase 6 — Visual Field Guide edition", () => {
  it("pins Field Guide provenance into the Spec stack", () => {
    expect(VISUAL_FIELD_GUIDE_EDITION).toBe("1.0");
    expect(VISUAL_FIELD_GUIDE_PROVENANCE).toBe("visual-field-guide@1.0");
    expect(PRODUCTION_SPEC_STACK_PROVENANCE).toContain("visual-field-guide@1.0");
  });
});

describe("Phase 6 — catalog completeness", () => {
  it("covers all 15 services with checkFirst and checkLast", () => {
    const recipes = listServiceVisualRecipes();
    expect(recipes).toHaveLength(15);
    const numbers = recipes.map((r) => r.serviceNumber);
    expect(numbers).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ]);
    for (const r of recipes) {
      expect(r.checkFirst.length).toBeGreaterThan(0);
      expect(r.checkLast.length).toBeGreaterThan(0);
      expect(r.compositionPrompt.length).toBeGreaterThan(20);
      expect(r.mantra.length).toBeGreaterThan(5);
    }
  });

  it("normalizes service aliases without branding→ads collision", () => {
    expect(normalizeVisualFieldGuideService("branding")).toBe("branding");
    expect(normalizeVisualFieldGuideService("ads")).toBe("ads");
    expect(normalizeVisualFieldGuideService("campaigns")).toBe("ads");
    expect(normalizeVisualFieldGuideService("web")).toBe("website");
    expect(normalizeVisualFieldGuideService("visual-production")).toBe(
      "photography",
    );
    expect(getServiceVisualRecipe("branding")?.serviceNumber).toBe("03");
  });

  it("resolves identity + layout + recipe pack", () => {
    const guide = resolveVisualFieldGuide({ service: "social" });
    expect(guide.identity.lines.length).toBeGreaterThan(0);
    expect(guide.layout.lines.length).toBeGreaterThan(0);
    expect(guide.formatLogic.masters).toHaveLength(4);
    expect(guide.recipe?.service).toBe("social");
    expect(guide.recipeGateChecks.length).toBeGreaterThan(0);
    expect(guide.goodPractice.length).toBe(7);
  });
});

describe("Phase 6 — prompt block inject", () => {
  it("embeds Field Guide sections for every service default rule", () => {
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
    });
    expect(resolved).toBeDefined();
    const block = buildProductionPromptBlock({ rule: resolved!.rule });
    const ids = block.sections.map((s) => s.id);
    expect(ids).toContain("identity_system");
    expect(ids).toContain("layout_hygiene");
    expect(ids).toContain("placement_hygiene");
    expect(ids).toContain("format_logic");
    expect(ids).toContain("service_visual_recipe");
    expect(ids).toContain("good_practice");
    expect(ids).toContain("final_hygiene");
    expect(block.text).toContain("Visual Field Guide");
    expect(block.text).toContain("Make one idea worth stopping for.");
    expect(block.provenance).toBe(PRODUCTION_SPEC_STACK_PROVENANCE);
  });

  it("can omit Field Guide sections when disabled", () => {
    const rule = getProductionRuleById("instagram.feed.portrait");
    expect(rule).toBeDefined();
    const block = buildProductionPromptBlock({
      rule: rule!,
      includeVisualFieldGuide: false,
    });
    expect(block.sections.map((s) => s.id)).not.toContain("identity_system");
  });
});

describe("Phase 6 — measured evidence", () => {
  it("evidences technical gate when canvas matches", () => {
    const rule = getProductionRuleById("instagram.feed.portrait");
    expect(rule?.canvas).toEqual({ width: 1080, height: 1350, unit: "px" });
    const measured = evaluateVisualFieldGuideMeasuredEvidence({
      rule: rule!,
      service: "social",
      generatedWidth: 1080,
      generatedHeight: 1350,
    });
    expect(measured.evidencedGateHygieneIds).toContain("technical");
    expect(measured.failedGateHygieneIds).toHaveLength(0);
  });

  it("fails technical for V canvas mismatch", () => {
    const rule = getProductionRuleById("linkedin.ad.single-image.square");
    expect(rule?.status).toBe("V");
    const measured = evaluateVisualFieldGuideMeasuredEvidence({
      rule: rule!,
      generatedWidth: 1000,
      generatedHeight: 1000,
    });
    expect(measured.failedGateHygieneIds).toContain("technical");
  });

  it("merges evidence with fail winning over evidenced", () => {
    const merged = mergeHygieneEvidenceIds({
      evidenced: ["technical", "safe-zones"],
      extraFailed: ["technical"],
      extraEvidenced: ["identity"],
    });
    expect(merged.failedGateHygieneIds).toContain("technical");
    expect(merged.evidencedGateHygieneIds).not.toContain("technical");
    expect(merged.evidencedGateHygieneIds).toContain("safe-zones");
    expect(merged.evidencedGateHygieneIds).toContain("identity");
  });

  it("auto-measures from execution context metadata", () => {
    const gateInput = buildProductionGateFromExecutionContext({
      service: "social",
      platform: "instagram",
      format: "feed-post",
      generatedWidth: 1080,
      generatedHeight: 1080,
    });
    expect(gateInput).toBeDefined();
    expect(gateInput!.evidencedGateHygieneIds).toContain("technical");

    const gate = evaluateProductionReleaseGate(gateInput!);
    expect(gate.hygiene.gateFailures).not.toContain("technical");
  });
});

describe("Phase 6 — vision judge scaffold", () => {
  afterEach(() => {
    setVisualFieldGuideJudgeRunner(undefined);
  });

  it("builds rubric with MODEL_JUDGED checks for branding", () => {
    const { rubricLines, checks } = buildVisualFieldGuideJudgeRubric({
      service: "branding",
    });
    expect(checks.some((c) => c.id === "vfg.supplied-artwork")).toBe(true);
    expect(rubricLines.some((l) => l.includes("auditor"))).toBe(true);
  });

  it("leaves MODEL_JUDGED unresolved when no runner (REVIEW path)", async () => {
    const result = await runVisualFieldGuideJudge({ service: "branding" });
    expect(result.status).toBe("skipped");
    expect(result.unresolvedGateHygieneIds.length).toBeGreaterThan(0);
    expect(result.evidencedGateHygieneIds).toHaveLength(0);
  });

  it("records pass/fail from a registered runner", async () => {
    setVisualFieldGuideJudgeRunner(async ({ checks }) =>
      checks.map((c) =>
        Object.freeze({
          checkId: c.id,
          verdict: "pass" as const,
          rationale: "fixture pass",
          confidence: 0.9,
        }),
      ),
    );
    const result = await runVisualFieldGuideJudge({ service: "branding" });
    expect(result.status).toBe("ok");
    expect(result.evidencedGateHygieneIds.length).toBeGreaterThan(0);
    expect(result.failedGateHygieneIds).toHaveLength(0);
  });
});

describe("Phase 6 — QC surfaces", () => {
  it("includes Field Guide check first/last in Admin QC", () => {
    const items = resolveQcChecklistItems({ service: "email" });
    const vfg = items.filter((i) => i.id.startsWith("vfg."));
    expect(vfg.length).toBeGreaterThanOrEqual(2);
    expect(vfg.some((i) => i.label.includes("Check first"))).toBe(true);
    expect(vfg.some((i) => i.label.includes("Check last"))).toBe(true);
  });
});

describe("Phase 6 — stamp evidence helper", () => {
  it("stamps measured technical evidence onto metadata", async () => {
    const { stampVisualFieldGuideEvidenceOnMetadata } = await import(
      "../../../src/platform/config/format-production-spec"
    );
    const stamped = await stampVisualFieldGuideEvidenceOnMetadata({
      metadata: {
        service: "social",
        platform: "instagram",
        format: "feed-post",
      },
      generatedWidth: 1080,
      generatedHeight: 1080,
      skipVisionJudge: true,
    });
    expect(stamped.metadata.evidencedGateHygieneIds).toContain("technical");
    expect(stamped.metadata.generatedWidth).toBe(1080);
    expect(stamped.vision).toBeUndefined();
  });
});

describe("Phase 6 — apply after image + OpenAI runner", () => {
  afterEach(() => {
    setVisualFieldGuideJudgeRunner(undefined);
  });

  it("applyVisualFieldGuideEvidenceAfterImage is a no-op without media", async () => {
    const { applyVisualFieldGuideEvidenceAfterImage } = await import(
      "../../../src/platform/config/format-production-spec"
    );
    const result = await applyVisualFieldGuideEvidenceAfterImage({
      metadata: { service: "social" },
      runtimeOutput: {},
      skipVisionJudge: true,
    });
    expect(result.applied).toBe(false);
  });

  it("apply stamps dims from PNG bytes in runtime outputs", async () => {
    const { applyVisualFieldGuideEvidenceAfterImage } = await import(
      "../../../src/platform/config/format-production-spec"
    );
    // Minimal 1×1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const result = await applyVisualFieldGuideEvidenceAfterImage({
      metadata: {
        service: "social",
        platform: "instagram",
        format: "feed-post-square",
      },
      runtimeOutput: {
        outputs: [
          {
            type: "image",
            mimeType: "image/png",
            base64: png.toString("base64"),
          },
        ],
      },
      skipVisionJudge: true,
    });
    expect(result.applied).toBe(true);
    expect(result.generatedWidth).toBe(1);
    expect(result.generatedHeight).toBe(1);
    expect(result.metadata.generatedWidth).toBe(1);
    // 1×1 ≠ Spec 1080×1080 → technical fail when explicit? soft D → skip fail
    expect(result.metadata.failedGateHygieneIds ?? []).not.toContain(
      "technical",
    );
  });

  it("OpenAI runner parses fixture vision JSON", async () => {
    const {
      createOpenAiVisualFieldGuideJudgeRunner,
      buildVisualFieldGuideJudgeRubric,
    } = await import("../../../src/platform/config/format-production-spec");

    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  checks: [
                    {
                      checkId: "vfg.placement-named",
                      verdict: "pass",
                      rationale: "placement clear",
                      confidence: 0.8,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const runner = createOpenAiVisualFieldGuideJudgeRunner({
      apiKey: "sk-test",
      fetchImpl,
    });
    expect(runner).toBeDefined();
    const { checks, rubricLines } = buildVisualFieldGuideJudgeRubric({
      service: "social",
    });
    expect(checks.some((c) => c.id === "vfg.placement-named")).toBe(true);
    const results = await runner!({
      rubricLines,
      checks: checks.filter((c) => c.id === "vfg.placement-named"),
      imageBytes: Buffer.from("fake"),
      mimeType: "image/png",
    });
    expect(results[0]?.verdict).toBe("pass");
  });

  it("vision rollout canary only runs for canary services", async () => {
    const {
      visualFieldGuideVisionShouldRun,
      resolveVisualFieldGuideVisionRollout,
    } = await import("../../../src/platform/config/format-production-spec");
    expect(
      resolveVisualFieldGuideVisionRollout({
        VISUAL_FIELD_GUIDE_VISION: "canary",
      } as NodeJS.ProcessEnv),
    ).toBe("canary");
    expect(
      visualFieldGuideVisionShouldRun({
        service: "social",
        rollout: "canary",
      }),
    ).toBe(true);
    expect(
      visualFieldGuideVisionShouldRun({
        service: "branding",
        rollout: "canary",
      }),
    ).toBe(false);
    expect(
      visualFieldGuideVisionShouldRun({
        service: "branding",
        rollout: "on",
      }),
    ).toBe(true);
  });
});
