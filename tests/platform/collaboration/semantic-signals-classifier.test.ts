/**
 * Semantic signals classifier + brand extract rollout — unit coverage.
 */

import {
  classifySemanticSignals,
  resolveSemanticLlmRollout,
} from "../../../src/platform/collaboration/conversational-task-intelligence/semantic-signals-classifier";
import {
  enrichBrandPreferencesFromBrief,
  resolveBrandLlmExtractRollout,
  extractMechanicalBrandColors,
} from "../../../src/services/brand-brief-llm-extractor";
import { resolveTextCreativeUseCase } from "../../../src/platform/providers/routing/matrix/matrix-use-case-routing";

describe("semantic-signals-classifier", () => {
  it("defaults CTI_SEMANTIC_LLM to on", () => {
    expect(resolveSemanticLlmRollout({})).toBe("on");
  });

  it("falls back to heuristics when integration is missing", async () => {
    const result = await classifySemanticSignals({
      message: "yes looks good, approve",
      organizationId: "org_1",
    });
    expect(result.source).toBe("heuristic_fallback");
    expect(result.isApproval).toBe(true);
  });

  it("maps LLM structured output when provider succeeds", async () => {
    const run = jest.fn(async () => ({
      ok: true as const,
      value: {
        success: true,
        artifacts: {
          runtime: {
            response: {
              output: {
                structured: {
                  isQuestion: false,
                  isImperative: true,
                  isFeedback: false,
                  isApproval: false,
                  isRejection: false,
                  isContinuation: false,
                  isVariation: false,
                  isModification: true,
                  isRemoval: false,
                  isReplacement: false,
                  isReversion: false,
                  isComparison: false,
                  isExplanation: false,
                  isSummarization: false,
                  isTransformation: false,
                  isTaskSwitch: false,
                  isReset: false,
                  isSelection: false,
                  isCreation: false,
                  isRegeneration: false,
                  isExport: false,
                  exportFormat: "",
                  hasDeicticReference: true,
                  referencesExistingResult: true,
                  isAssetExtraction: false,
                  isDeliveryRequest: false,
                  hasOrdinalReference: false,
                  hasVersionReference: false,
                  hasSuperlativeReference: false,
                  persistentScope: false,
                  temporaryScope: false,
                  mentionsArtifactType: "",
                  quantityHint: "",
                  isSubstantiveNewGeneration: false,
                  confidence: 0.91,
                },
              },
            },
          },
        },
      },
    }));

    const result = await classifySemanticSignals({
      message: "isko thoda aur bold banao",
      organizationId: "org_1",
      integration: { run } as never,
      rollout: "on",
    });

    expect(result.source).toBe("llm");
    expect(result.isModification).toBe(true);
    expect(result.hasDeicticReference).toBe(true);
    expect(result.confidence).toBeCloseTo(0.91);
    expect(run).toHaveBeenCalled();
  });
});

describe("brand-brief-llm-extractor primary path", () => {
  it("defaults BRAND_EXTRACT_LLM to on", () => {
    expect(resolveBrandLlmExtractRollout({})).toBe("on");
  });

  it("extracts hex mechanically without language understanding", () => {
    expect(extractMechanicalBrandColors("palette #A1B2C3 and laal")).toEqual([
      "#a1b2c3",
    ]);
  });

  it("prefers LLM facts and merges hex", async () => {
    const run = jest.fn(async () => ({
      ok: true as const,
      value: {
        success: true,
        artifacts: {
          runtime: {
            response: {
              output: {
                structured: {
                  colors: ["red", "navy"],
                  toneAdjectives: ["bold"],
                  avoidList: [],
                  typography: [],
                  styleNotes: [],
                  industry: "coffee",
                  targetAudience: "students",
                  positioning: "",
                  brandSummary: "",
                  photographyStyle: "",
                  illustrationStyle: "",
                },
              },
            },
          },
        },
      },
    }));

    const result = await enrichBrandPreferencesFromBrief({
      prompt: "UAE mein cold coffee #112233 laal aur navy students ke liye",
      organizationId: "org_1",
      integration: { run } as never,
      rollout: "on",
    });

    expect(result.extractionSource).toBe("llm+hex");
    expect(result.colors).toEqual(
      expect.arrayContaining(["#112233", "red", "navy"])
    );
    expect(result.industry).toBe("coffee");
    expect(result.toneAdjectives).toEqual(["bold"]);
  });

  it("uses heuristic fallback when no integration", async () => {
    const result = await enrichBrandPreferencesFromBrief({
      prompt: "Brand colors: red and blue. Tone is playful.",
    });
    expect(result.extractionSource).toBe("heuristic_fallback");
    expect(result.colors).toEqual(expect.arrayContaining(["red", "blue"]));
  });
});

describe("matrix multilingual script detection", () => {
  it("routes Devanagari briefs to multilingual lane", () => {
    expect(
      resolveTextCreativeUseCase("लाल और नीला रंग में पोस्टर बनाओ")
    ).toBe("multilingual");
  });

  it("routes Arabic script to multilingual lane", () => {
    expect(resolveTextCreativeUseCase("اصنع بوستر باللون الأحمر")).toBe(
      "multilingual"
    );
  });
});
