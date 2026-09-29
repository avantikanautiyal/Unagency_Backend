/**
 * Semantic quality chain regressions — generic across services.
 * No Social Media / Instagram / provider-specific branches.
 */

import {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY,
  PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY_FORMAT,
  buildProductionPromptBlock,
  promptContainsProductionSpecBlock,
  resolveProductionRule,
} from "../../../src/platform/config/format-production-spec";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import type { CanonicalModelRequest } from "../../../src/platform/ai/canonical-model-request";
import { composeGenerationSemanticObjective } from "../../../src/platform/cdf/generation-context/compose-semantic-objective";
import { assessCreativeDirectionCompleteness } from "../../../src/platform/cdf/generation-context/creative-direction-completeness";
import { resolveCanonicalBrandContextFromMetadata } from "../../../src/platform/cdf/generation-context/resolve-brand-product-context";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";

function minimalGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction:
      "I want an introductory feed post about my brand that describes it properly and follows its colour scheme.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "brand_1",
      brandName: "Sunflower",
      facts: [
        { key: "brandName", value: "Sunflower", provenance: "selected_brand" },
        { key: "brandColors", value: "blue, green, yellow", provenance: "execution_metadata" },
      ],
      negatives: [],
      factKeys: ["brandName", "brandColors"],
    },
    productGrounding: {
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "feed-post",
    },
    selectedSemanticChoices: [
      {
        phaseId: "routes",
        artifactId: "cdfart_test_routes",
        version: 1,
        artifactKey: "service.routes",
        selectedRouteIndex: 0,
        optionNumber: 1,
        choiceArrayKey: "routes",
        semanticFieldNames: [
          "routeId",
          "name",
          "creativeIdea",
          "visualTreatment",
          "headlineAngle",
          "rationale",
        ],
        choice: {
          routeId: "route_01",
          name: "Brand Story Garden",
          creativeIdea:
            "A vibrant garden scene where educational elements bloom like sunflowers, introducing the brand mission to nurture young minds.",
          visualTreatment:
            "Whimsical illustration with sunflower motifs and learning icons in blue, green, yellow, cream; logo prominently placed.",
          headlineAngle:
            "Where learning blooms bright — introducing Sunflower for classes 1–12.",
          rationale:
            "Garden metaphor communicates growth; palette creates recognition; tone matches child-first positioning.",
        },
      },
    ],
    cdfContext: {
      contextId: "ctx_test",
      contextHash: "hash",
      sessionId: "cdf_test",
      serviceId: "generic-service",
      phaseId: "output",
      sessionVersion: 1,
      contextSource: "test",
      status: "ok",
      phaseContext: {
        phaseId: "output",
        serviceId: "generic-service",
        name: "Creative",
        uxType: "visual",
        generationModality: "image",
        artifactType: "image",
        artifactKey: "service.output",
        implementationStatus: "active",
        dependencyPhaseIds: ["routes"],
        allowNonVisualReady: false,
        selectionMode: "required_one",
        approvalMode: "required",
        refinementEnabled: true,
        refinementScopes: [],
        entryMessage: "Here is your creative based on the selected route:",
        description: "Here is your creative based on the selected route:",
        executionStrategy: "canonical",
        outputLabel: "Creative",
      } as CanonicalGenerationRequest["cdfContext"]["phaseContext"],
    },
    upstreamArtifacts: [],
    outputContract: {
      serviceId: "generic-service",
      phaseId: "output",
      generationModality: "image",
      artifactKey: "service.output",
      canonicalFullDeck: false,
      instructions: ["Generate the phase deliverable."],
      executionStrategy: "canonical",
    },
    generationContextHash: "testhash",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("semantic quality chain — creative direction completeness", () => {
  it("rejects vague populated fields as non-actionable", () => {
    const weak = assessCreativeDirectionCompleteness({
      name: "Nice Idea",
      creativeIdea: "Create a beautiful brand introduction.",
      visualTreatment: "Use a modern visual style.",
      headlineAngle: "Tell the brand story creatively.",
      rationale: "Looks good.",
    });
    expect(weak.sufficientlyDescriptive).toBe(false);
  });

  it("accepts actionable brand-story directions", () => {
    const strong = assessCreativeDirectionCompleteness({
      name: "Brand Story Garden",
      creativeIdea:
        "A vibrant garden scene where educational elements bloom like sunflowers, introducing the brand mission.",
      visualTreatment:
        "Whimsical illustration with sunflower motifs and learning icons in blue, green, yellow, cream.",
      headlineAngle:
        "Where learning blooms bright — introducing Sunflower for classes 1–12.",
      rationale:
        "Garden metaphor communicates growth while palette creates recognition for parents and schools.",
    });
    expect(strong.sufficientlyDescriptive).toBe(true);
    expect(strong.actionableFieldCount).toBeGreaterThanOrEqual(3);
    expect(strong.actionability).toBe("partially_actionable");
  });

  it("grades production-complete directions as complete", () => {
    const complete = assessCreativeDirectionCompleteness({
      name: "Welcome Garden",
      creativeIdea:
        "Introduce the brand as a nurturing garden where children’s potential grows.",
      visualTreatment:
        "Typography-forward layout with geometric sunflower motifs and warm cream field.",
      headlineAngle: "Welcome — learning that helps whole children flourish.",
      rationale:
        "Garden metaphor builds warmth and trust while staying true to brand cues.",
      composition:
        "Asymmetric typography-led layout with headline dominant and mark secondary.",
      hierarchy: "1) Headline 2) Supporting vignette 3) Brand mark.",
      brandIntegration:
        "Place identity mark subordinately; do not build a logo lockup poster.",
    });
    expect(complete.actionability).toBe("complete");
  });
});

describe("semantic quality chain — objective + brand projection", () => {
  it("does not use phase entryMessage as SemanticObjective", () => {
    const generation = minimalGeneration();
    const objective = composeGenerationSemanticObjective(generation);
    expect(objective).not.toContain("Here is your creative based on the selected route");
    expect(objective).toMatch(/Sunflower|introductory|Brand Story Garden|feed-post|instagram/i);
    expect(objective).toMatch(/Production Spec supplies technical constraints only/i);
  });

  it("projects brandSummary and brandIllustrationStyle aliases into brand context", () => {
    const ctx = resolveCanonicalBrandContextFromMetadata(
      {
        brandId: "6a98c471613dce5f8e5b8b9f",
        brandName: "Sunflower",
        brandSummary: "Educational brand helping children flourish.",
        brandIllustrationStyle: "premium 2D cartoon with sunflower motifs",
        brandColors: ["blue", "green", "yellow"],
      },
      { generationModality: "image", uxType: "visual" },
    );
    expect(ctx?.brandName).toBe("Sunflower");
    const keys = new Set(ctx?.factKeys ?? []);
    expect(keys.has("brandSummary")).toBe(true);
    expect(keys.has("illustrationStyle")).toBe(true);
    expect(
      ctx?.facts.find((f) => f.key === "illustrationStyle")?.value,
    ).toMatch(/cartoon/i);
  });

  it("compiles CMR with composed semantic objective and selected direction intact", () => {
    const generation = minimalGeneration();
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "feed-post",
      placementId: "feed.square",
    });
    const block = buildProductionPromptBlock({ rule: resolved!.rule });
    const cmr = compileCanonicalModelRequestFromGeneration(generation, {
      productionSpec: {
        productionRuleId: resolved!.rule.id,
        contentHash: block.contentHash,
        authorityStatus: "D",
        edition: "1.0",
        provenance: "test",
        version: "1.1.0",
        sections: [...block.sections],
        text: block.text,
      },
    });
    const task = cmr.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "current_task");
    expect(task && task.type === "structured").toBe(true);
    if (task && task.type === "structured") {
      const data = task.data as Record<string, unknown>;
      expect(String(data.SemanticObjective)).not.toContain(
        "Here is your creative based on the selected route",
      );
      expect(String(data.SemanticObjective)).toMatch(/Sunflower|Brand Story Garden/i);
      expect(data.PhaseEntryMessage).toContain("selected route");
    }
    const directions = cmr.messages
      .flatMap((m) => m.content)
      .find(
        (p) =>
          p.type === "structured" && p.name === "selected_semantic_directions",
      );
    expect(directions).toBeDefined();
    const prompt = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    const instrIdx = prompt.indexOf("===== CURRENT USER INSTRUCTION =====");
    const specIdx = prompt.indexOf("===== PRODUCTION SPEC =====");
    expect(instrIdx).toBeGreaterThanOrEqual(0);
    expect(specIdx).toBeGreaterThan(instrIdx);
    expect(prompt).toContain("Brand Story Garden");
    expect(prompt).toContain("[production_constraints]");
    expect(prompt).toMatch(/NOT brand names, logos, or wordmarks/i);
    expect(prompt).not.toMatch(/\[Format Production Spec\]/);
    expect(prompt).not.toMatch(/\[UNAGENCY Production Spec\]/);
  });
});

describe("semantic quality chain — production constraints header", () => {
  it("uses non-brandable machine header and detects legacy headers", () => {
    expect(PRODUCTION_PROMPT_BLOCK_HEADER).toBe("[production_constraints]");
    expect(promptContainsProductionSpecBlock(PRODUCTION_PROMPT_BLOCK_HEADER)).toBe(
      true,
    );
    expect(
      promptContainsProductionSpecBlock(PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY),
    ).toBe(true);
    expect(
      promptContainsProductionSpecBlock(
        PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY_FORMAT,
      ),
    ).toBe(true);
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "feed-post",
      placementId: "feed.square",
    });
    const block = buildProductionPromptBlock({ rule: resolved!.rule });
    expect(block.text.startsWith("[production_constraints]")).toBe(true);
    expect(block.text).not.toMatch(/\[Format Production Spec\]/);
    expect(block.text).not.toMatch(/UNAGENCY wordmark/i);
  });
});

describe("semantic quality chain — prompt precedence", () => {
  it("places creative authority before production constraints", () => {
    const cmr = {
      messages: [
        {
          role: "developer",
          content: [
            {
              type: "structured",
              name: "production_spec",
              data: {
                text: `${PRODUCTION_PROMPT_BLOCK_HEADER}\nCanvas: 1080x1080`,
              },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              semanticRole: "current_user_instruction",
              text: "Make an introductory brand post.",
            },
            {
              type: "structured",
              name: "brand_context",
              data: { brandName: "Sunflower" },
            },
            {
              type: "structured",
              name: "selected_semantic_directions",
              data: [{ choice: { name: "Brand Story Garden" } }],
            },
          ],
        },
      ],
      context: {
        requirements: [],
        constraints: [],
        exclusions: [],
        selections: [],
        approvedDecisions: [],
      },
      outputContract: {
        name: "out",
        required: true,
        instructions: [],
        generationModality: "image",
      },
      metadata: {},
    } as unknown as CanonicalModelRequest;
    const prompt = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(prompt.indexOf("CURRENT USER INSTRUCTION")).toBeLessThan(
      prompt.indexOf("PRODUCTION SPEC"),
    );
    expect(prompt.indexOf("SELECTED SEMANTIC DIRECTIONS")).toBeLessThan(
      prompt.indexOf("PRODUCTION SPEC"),
    );
    expect(prompt.indexOf("BRAND CONTEXT")).toBeLessThan(
      prompt.indexOf("PRODUCTION SPEC"),
    );
  });
});
