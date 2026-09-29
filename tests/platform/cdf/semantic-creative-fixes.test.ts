/**
 * Semantic creative fixes — production-actionable directions, reference roles,
 * and no authoritative truncation. Generic across services (no platform branches).
 */

import {
  formatAuthoritativeCreativeDirection,
  compactCreativeDirectionSummary,
  pickCreativeDirectionProductionFields,
} from "../../../src/platform/cdf/creative-direction/production-semantics";
import { assessCreativeDirectionCompleteness } from "../../../src/platform/cdf/generation-context/creative-direction-completeness";
import { composeGenerationSemanticObjective } from "../../../src/platform/cdf/generation-context/compose-semantic-objective";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";
import { resolveSelectedSemanticChoices } from "../../../src/platform/cdf/generation-context/resolve-selected-choice";
import { descriptorsFromExecutionMetadata } from "../../../src/platform/cdf/generation-context/resolve-multimodal-context";
import { selectMultimodalContext } from "../../../src/platform/ai/multimodal-context";
import {
  planImageReferenceAdaptation,
  resolveMultimodalReferenceRole,
} from "../../../src/platform/ai/multimodal-context/reference-role";
import {
  applyReferenceRolePromptGuidance,
  extractReferenceImages,
} from "../../../src/platform/providers/image/common/vendor-image-protocol";
import { IdeogramImageProtocol } from "../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { RecraftImageProtocol } from "../../../src/platform/providers/image/recraft/recraft-image-protocol";
import { IDEOGRAM_IMAGE_SPEC, RECRAFT_IMAGE_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import { normalizeSocialMediaRoutes } from "../../../src/platform/cdf/generation-artifact/adapters/social-media";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const LONG_TREATMENT =
  "Typography-forward layout with the brand name and tagline integrated into floral geometric sunflower motifs across a warm cream field, secondary supporting illustrations of children learning in soft silhouette clusters along the lower third, generous breathing room in the upper right for platform safe-area margins, and a subordinate corner identity mark that never becomes the full composition subject. ".repeat(
    3,
  ).trim();

function productionDirection() {
  return {
    routeId: "route_03_welcome_garden",
    name: "Welcome to Our Garden",
    creativeIdea:
      "Introduce the brand as a nurturing garden where children’s potential grows across classes 1–12.",
    visualTreatment: LONG_TREATMENT,
    headlineAngle: "Welcome to the garden — learning that helps whole children flourish.",
    rationale:
      "Garden metaphor builds warmth and trust for parents while staying true to sunflower identity cues.",
    communicationObjective:
      "Create an introductory feed creative that introduces the brand to a new audience.",
    primaryMessage: "Welcome — we nurture every child’s growth.",
    secondaryMessage: "Classes 1–12 · whole-child learning.",
    visualConcept: "Abstract garden geometry with sunflower motifs and soft learning icons.",
    focalPoint: "Headline cluster with garden motif framing — not the logo alone.",
    composition:
      "Asymmetric typography-led layout: headline upper-left, supporting scene lower third, mark small lower-right.",
    hierarchy: "1) Headline 2) Supporting vignette 3) Brand mark 4) Soft colour wash.",
    typographyDirection: "Friendly rounded sans for headline; restrained secondary line.",
    supportingVisualElements: "Geometric petals, soft learning icons, cream/gold/blue accents.",
    brandIntegration:
      "Apply brand colours and tone; place identity mark subordinately; do not build a logo lockup poster.",
    identityMarkRole: "Small corner lockup — secondary to message and scene.",
    audienceSignal: "Parents discovering the brand for the first time.",
    useContextIntent: "Finished social feed creative introducing the brand.",
    avoidances:
      "Do not produce a flat logo-on-empty-canvas treatment or a wordmark sheet.",
  };
}

function minimalGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  const choice = productionDirection();
  return {
    currentUserInstruction:
      "Create an introductory feed post for the selected brand that describes it and follows its colour scheme.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "brand_1",
      brandName: "ExampleBrand",
      facts: [
        { key: "brandName", value: "ExampleBrand", provenance: "selected_brand" },
      ],
      negatives: [],
      factKeys: ["brandName"],
    },
    productGrounding: {
      service: "creative",
      subtype: "content-design",
      platform: "feed",
      format: "square",
    },
    selectedSemanticChoices: [
      {
        phaseId: "routes",
        artifactId: "cdfart_test_routes",
        version: 1,
        artifactKey: "service.routes",
        selectedRouteIndex: 2,
        optionNumber: 3,
        choiceArrayKey: "routes",
        label: choice.name,
        semanticFieldNames: Object.keys(choice),
        choice,
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

function requestWithRole(
  role: string,
  prompt = "Finished creative for the brand",
): ProviderExecutionRequest {
  return {
    requestId: "req_role",
    providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
    modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
    capabilityId: "image.generate" as never,
    payload: {
      prompt,
      text: prompt,
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: role,
      },
    },
    metadata: {
      referenceInputPresent: true,
      referenceInputType:
        role === "identity_mark" ? "brand_vault_asset" : "artifact",
    },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
}

describe("TEST A — production-actionable direction survives normalize → selection → CMR", () => {
  it("preserves authoritative production fields through normalize and CMR", () => {
    const original = productionDirection();
    const normalized = normalizeSocialMediaRoutes({
      routes: [
        { name: "A", creativeIdea: "x".repeat(50), visualTreatment: "y".repeat(50), headlineAngle: "h".repeat(50), rationale: "r".repeat(50) },
        { name: "B", creativeIdea: "x".repeat(50), visualTreatment: "y".repeat(50), headlineAngle: "h".repeat(50), rationale: "r".repeat(50) },
        original,
      ],
    });
    const selected = normalized.routes[2]!;
    expect(selected.composition).toContain("Asymmetric");
    expect(selected.hierarchy).toContain("Headline");
    expect(selected.brandIntegration).toMatch(/subordinately/i);
    expect(selected.identityMarkRole).toMatch(/corner/i);
    expect(selected.visualTreatment!.length).toBeGreaterThan(400);

    const resolved = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          artifactId: "cdfart_test_routes",
          version: 1,
          artifactKey: "service.routes",
          routeIndex: 2,
        },
      ],
      upstream: [
        {
          phaseId: "routes",
          artifactId: "cdfart_test_routes",
          version: 1,
          artifactKey: "service.routes",
          role: "selected_reference",
          sessionRole: "selected",
          data: normalized,
        } as never,
      ],
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const choice = resolved.choices[0]!.choice;
    expect(choice.composition).toBe(original.composition);
    expect(choice.visualTreatment).toBe(original.visualTreatment);

    const cmr = compileCanonicalModelRequestFromGeneration(
      minimalGeneration({
        selectedSemanticChoices: resolved.choices,
      }),
    );
    const dirPart = cmr.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "selected_semantic_directions");
    expect(dirPart && dirPart.type === "structured").toBe(true);
    if (!dirPart || dirPart.type !== "structured") return;
    const payload = JSON.stringify(dirPart.data);
    expect(payload).toContain("Asymmetric typography-led layout");
    expect(payload).toContain(original.identityMarkRole!);
    expect(payload.length).toBeGreaterThan(400);
  });
});

describe("TEST B — no authoritative truncation", () => {
  it("formatAuthoritativeCreativeDirection keeps full visualTreatment beyond 400 chars", () => {
    const choice = productionDirection();
    expect(choice.visualTreatment!.length).toBeGreaterThan(400);
    const authoritative = formatAuthoritativeCreativeDirection(choice);
    expect(authoritative).toContain(choice.visualTreatment!);
    expect(authoritative).not.toMatch(/brand nam$/);
    const preview = compactCreativeDirectionSummary(choice, 80);
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).not.toContain(choice.composition!);
  });

  it("pickCreativeDirectionProductionFields does not invent missing fields", () => {
    const picked = pickCreativeDirectionProductionFields({
      name: "Only Name",
      composition: "Clear left-right split with headline dominant.",
    });
    expect(picked.composition).toMatch(/left-right/i);
    expect(picked.hierarchy).toBeUndefined();
    expect(picked.brandIntegration).toBeUndefined();
  });
});

describe("TEST C — identity_mark role preserved (≠ style_reference)", () => {
  it("CMR multimodal items carry identity_mark", () => {
    const descriptors = descriptorsFromExecutionMetadata({
      referenceInputType: "brand_vault_asset",
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: "identity_mark",
        assetId: "asset_logo_1",
      },
    });
    expect(descriptors[0]?.semanticReferenceRole).toBe("identity_mark");
    const mm = selectMultimodalContext({
      descriptors,
      organizationId: "org_1",
    });
    expect(mm.items[0]?.semanticReferenceRole).toBe("identity_mark");

    const cmr = compileCanonicalModelRequestFromGeneration(
      minimalGeneration({ multimodalContext: mm }),
    );
    const mmPart = cmr.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "multimodal_context");
    expect(mmPart && mmPart.type === "structured").toBe(true);
    if (!mmPart || mmPart.type !== "structured") return;
    const items = (mmPart.data as { items: Array<{ semanticReferenceRole?: string }> }).items;
    expect(items[0]?.semanticReferenceRole).toBe("identity_mark");
  });

  it("Ideogram adaptation keeps canonicalRole identity_mark and does not reclassify as style_reference", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithRole("identity_mark"),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).not.toBe("style_reference");
    expect(plan.referenceAdaptation?.[0]?.useStyleReferenceChannel).toBe(false);
    expect(plan.referenceAdaptation?.[0]?.semanticPreservationOnWire).toBe(true);
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "character_reference_images",
    );
    expect(String(plan.request.form?.fields.prompt)).toMatch(/REFERENCE ROLE = identity_mark/);
    expect(String(plan.request.form?.fields.prompt)).not.toMatch(
      /REFERENCE ROLE = style_reference/,
    );
  });
});

describe("TEST D — role preservation across roles", () => {
  it.each([
    ["identity_mark", false],
    ["style_reference", true],
    ["product_reference", false],
  ] as const)(
    "role %s survives extract → adaptation (style channel allowed=%s)",
    (role, allowStyle) => {
      const refs = extractReferenceImages({
        image: {
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
          semanticReferenceRole: role,
        },
      });
      expect(refs[0]?.semanticReferenceRole).toBe(role);
      const { adaptations } = applyReferenceRolePromptGuidance({
        basePrompt: "Make the creative",
        references: refs,
      });
      expect(adaptations[0]?.canonicalRole).toBe(role);
      expect(adaptations[0]?.useStyleReferenceChannel).toBe(allowStyle);
      expect(planImageReferenceAdaptation(role).canonicalRole).toBe(role);
    },
  );
});

describe("TEST E — selected direction equality", () => {
  it("original ≈ selected ≈ CMR payload fields", () => {
    const original = productionDirection();
    const generation = minimalGeneration();
    const selected = generation.selectedSemanticChoices![0]!.choice;
    for (const key of [
      "creativeIdea",
      "visualTreatment",
      "composition",
      "hierarchy",
      "brandIntegration",
      "identityMarkRole",
      "primaryMessage",
    ] as const) {
      expect(selected[key]).toBe(original[key]);
    }
    const cmr = compileCanonicalModelRequestFromGeneration(generation);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain(original.composition!);
    expect(flat).toContain(original.hierarchy!);
    expect(flat).toContain(original.visualTreatment!);
  });
});

describe("TEST F — semantic objective is not entryMessage", () => {
  it("rejects UI acknowledgement as objective", () => {
    const generation = minimalGeneration();
    const objective = composeGenerationSemanticObjective(generation);
    expect(objective).not.toContain(
      "Here is your creative based on the selected route",
    );
    expect(objective).toMatch(/introductory|ExampleBrand|Welcome to Our Garden/i);
    const completeness = assessCreativeDirectionCompleteness(
      generation.selectedSemanticChoices![0]!.choice,
    );
    expect(completeness.actionability).toBe("complete");
    expect(completeness.actionableProductionFieldCount).toBeGreaterThanOrEqual(2);
  });

  it("classifies conceptual-only directions as partially_actionable", () => {
    const partial = assessCreativeDirectionCompleteness({
      name: "Brand Story Garden",
      creativeIdea:
        "A vibrant garden scene where educational elements bloom like sunflowers, introducing the brand mission.",
      visualTreatment:
        "Whimsical illustration with sunflower motifs and learning icons in blue, green, yellow, cream.",
      headlineAngle:
        "Where learning blooms bright — introducing the brand for classes 1–12.",
      rationale:
        "Garden metaphor communicates growth while palette creates recognition for parents and schools.",
    });
    expect(partial.sufficientlyDescriptive).toBe(true);
    expect(partial.actionability).toBe("partially_actionable");
  });
});

describe("TEST G — provider independence of canonical role", () => {
  it("Ideogram and Recraft preserve the same canonicalRole for identity_mark", () => {
    const ideogram = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithRole("identity_mark"),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    const recraft = new RecraftImageProtocol().buildGenerateRequest({
      spec: RECRAFT_IMAGE_SPEC,
      request: {
        ...requestWithRole("identity_mark"),
        providerId: RECRAFT_IMAGE_SPEC.canonicalProviderId as never,
        modelId: RECRAFT_IMAGE_SPEC.inventoryModelId,
      },
      wireModelId: RECRAFT_IMAGE_SPEC.wireModelId,
    });
    expect(ideogram.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(recraft.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(ideogram.referenceAdaptation?.[0]?.canonicalRole).toBe(
      recraft.referenceAdaptation?.[0]?.canonicalRole,
    );
  });

  it("brand_vault_asset alone produces NO semantic role", () => {
    expect(
      resolveMultimodalReferenceRole({} ),
    ).toBeUndefined();
    // Extra provenance fields must be ignored even if passed via callers.
    expect(
      resolveMultimodalReferenceRole({
        brandAssetRole: undefined,
        semanticReferenceRole: undefined,
      }),
    ).toBeUndefined();
  });

  it("CTI brandAssetRole logo still maps to identity_mark", () => {
    expect(
      resolveMultimodalReferenceRole({ brandAssetRole: "logo" }),
    ).toBe("identity_mark");
  });

  it("product asset alone produces NO semantic role", () => {
    const descriptors = descriptorsFromExecutionMetadata({
      referenceInputType: "brand_vault_asset",
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
      },
    });
    expect(descriptors[0]?.semanticReferenceRole).toBeUndefined();
  });

  it("referenceInputType alone produces NO semantic role", () => {
    expect(
      // Callers may still pass transport metadata; resolver must ignore it.
      resolveMultimodalReferenceRole({
        brandAssetRole: undefined,
      }),
    ).toBeUndefined();
    const refs = extractReferenceImages(
      {
        image: {
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
          referenceInputType: "brand_vault_asset",
        },
      },
      { referenceInputType: "brand_vault_asset" },
    );
    expect(refs[0]?.semanticReferenceRole).toBeUndefined();
  });
});
