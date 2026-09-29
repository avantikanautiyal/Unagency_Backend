/**
 * Framework-wide semantic reference role + deliverable + selected-only projection.
 */

import {
  resolveCanonicalReferenceRoleWithSource,
  resolveMultimodalReferenceRole,
} from "../../../src/platform/ai/multimodal-context/reference-role";
import { descriptorsFromExecutionMetadata } from "../../../src/platform/cdf/generation-context/resolve-multimodal-context";
import { selectMultimodalContext } from "../../../src/platform/ai/multimodal-context";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import { composeDeliverableSemantics } from "../../../src/platform/cdf/generation-context/compose-deliverable-semantics";
import { projectUpstreamArtifactDataForGeneration } from "../../../src/platform/cdf/generation-context/project-upstream-for-generation";
import {
  applyReferenceRolePromptGuidance,
  extractReferenceImages,
} from "../../../src/platform/providers/image/common/vendor-image-protocol";
import { IdeogramImageProtocol } from "../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { IDEOGRAM_IMAGE_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";
import { resolveCdfPhaseDependencies } from "../../../src/platform/cdf/canonical";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function minimalGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction:
      "Create an introductory Instagram post about my brand.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [
      {
        phaseId: "routes",
        routeIndex: 2,
        label: "Choice 3",
        semantic: "selection",
      },
    ],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "Sunflower",
      facts: [{ key: "brandName", value: "Sunflower" }],
      negatives: [],
      factKeys: ["brandName"],
    },
    productGrounding: {
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "feed-post",
      category: "instagram:feed-post",
    },
    selectedSemanticChoices: [
      {
        phaseId: "routes",
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "social-media.routes",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "The Sunflower Metaphor",
        choiceArrayKey: "routes",
        choice: {
          routeId: "route_03",
          name: "The Sunflower Metaphor",
          creativeIdea: "Illustrated sunflower metaphor intro",
          identityMarkRole: "Subtle signature in corner",
          useContextIntent: "Instagram feed pinned welcome",
        },
        semanticFieldNames: [
          "routeId",
          "name",
          "creativeIdea",
          "identityMarkRole",
          "useContextIntent",
        ],
      },
    ],
    cdfContext: {
      contextId: "ctx",
      contextHash: "h",
      sessionId: "cdf",
      serviceId: "social-media",
      phaseId: "output",
      sessionVersion: 1,
      contextSource: "test",
      status: "ok",
      phaseContext: {
        phaseId: "output",
        serviceId: "social-media",
        name: "Creative",
        uxType: "visual",
        generationModality: "image",
        artifactType: "image",
        artifactKey: "social-media.output",
        implementationStatus: "active",
        dependencyPhaseIds: ["routes"],
        allowNonVisualReady: false,
        selectionMode: "required_one",
        approvalMode: "required",
        refinementEnabled: true,
        refinementScopes: [],
        entryMessage: "Here is your social creative based on the selected route:",
        description: "Here is your social creative based on the selected route:",
        executionStrategy: "canonical",
        outputLabel: "Social Media Creative",
      } as CanonicalGenerationRequest["cdfContext"]["phaseContext"],
    },
    upstreamArtifacts: [
      {
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "social-media.routes",
        phaseId: "routes",
        role: "selected_reference",
        status: "selected",
        schemaVersion: "1",
        sessionRole: "selected",
        required: true,
        artifactProjectionMode: "selected_only",
        lineage: { sourceArtifacts: [] },
        data: {
          routes: [
            { name: "Blossoming Introduction", creativeIdea: "A" },
            { name: "Five Pillars", creativeIdea: "B" },
            {
              name: "The Sunflower Metaphor",
              creativeIdea: "Illustrated sunflower metaphor intro",
              identityMarkRole: "Subtle signature in corner",
            },
          ],
        },
      },
    ],
    outputContract: {
      serviceId: "social-media",
      phaseId: "output",
      generationModality: "image",
      artifactKey: "social-media.output",
      canonicalFullDeck: false,
      instructions: ["Generate ONLY the deliverable for CDF phase output."],
      executionStrategy: "canonical",
    },
    generationContextHash: "hash",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("canonical semantic reference role contract", () => {
  it("A — logoAssetId relation → CMR → extract → Ideogram adaptation preserves identity_mark", () => {
    const assetId = "6a98cb217bc20263f64311aa";
    const meta = {
      logoAssetId: assetId,
      brandLogoAssetId: assetId,
      assets: [
        {
          assetId,
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
        },
      ],
    };
    const descriptors = descriptorsFromExecutionMetadata(meta);
    expect(descriptors[0]?.semanticReferenceRole).toBe("identity_mark");
    expect(descriptors[0]?.referenceRoleResolutionSource).toBe(
      "authoritative_brand_logo_relation",
    );

    const ctx = selectMultimodalContext({
      descriptors,
      organizationId: "org",
    });
    expect(ctx.items[0]?.semanticReferenceRole).toBe("identity_mark");

    const refs = extractReferenceImages(
      {
        image: {
          assetId,
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
        },
      },
      meta,
    );
    expect(refs[0]?.semanticReferenceRole).toBe("identity_mark");

    const guided = applyReferenceRolePromptGuidance({
      basePrompt: "Create the post",
      references: refs,
    });
    expect(guided.adaptations[0]?.canonicalRole).toBe("identity_mark");
    expect(guided.prompt).toContain("REFERENCE ROLE = identity_mark");

    const protocol = new IdeogramImageProtocol();
    const req: ProviderExecutionRequest = {
      requestId: "req",
      providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
      modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
      capabilityId: "image.generate" as never,
      payload: {
        prompt: "Create the post",
        image: {
          assetId,
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
          semanticReferenceRole: "identity_mark",
        },
      },
      metadata: meta,
      context: {} as never,
      timeoutPolicy: {} as never,
      retryPolicy: {} as never,
    };
    const plan = protocol.buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: req,
      wireModelId: "ideogram-3",
    });
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "character_reference_images",
    );
    expect(plan.referenceRoleObservability?.canonicalReferenceRole).toBe(
      "identity_mark",
    );
    expect(plan.referenceRoleObservability?.providerReferenceTransport).toBe(
      "character_reference_images",
    );
    expect(plan.referenceRoleObservability?.providerSemanticMeaning).toBe(
      "identity_preservation",
    );
    expect(plan.referenceRoleObservability?.providerReferenceRolePreserved).toBe(
      true,
    );
  });

  it("B — generic brand-vault asset does NOT become identity_mark", () => {
    expect(
      resolveMultimodalReferenceRole({
        // provenance-only fields must not be consulted — omitted intentionally
      }),
    ).toBeUndefined();
    expect(
      resolveCanonicalReferenceRoleWithSource({
        matchesAuthoritativeBrandLogoRelation: false,
      }).role,
    ).toBeUndefined();

    const descriptors = descriptorsFromExecutionMetadata({
      referenceInputType: "brand_vault_asset",
      assets: [
        {
          assetId: "asset_generic",
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY_PNG}`,
        },
      ],
    });
    expect(descriptors[0]?.semanticReferenceRole).toBeUndefined();
  });

  it("C — Ideogram identity_mark uses character_reference_images (not style channel)", () => {
    const protocol = new IdeogramImageProtocol();
    const plan = protocol.buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      wireModelId: "ideogram-3",
      request: {
        requestId: "r",
        providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
        modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
        capabilityId: "image.generate" as never,
        payload: {
          prompt: "x",
          image: {
            mimeType: "image/png",
            url: `data:image/png;base64,${TINY_PNG}`,
            semanticReferenceRole: "identity_mark",
          },
        },
        metadata: {},
        context: {} as never,
        timeoutPolicy: {} as never,
        retryPolicy: {} as never,
      },
    });
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "character_reference_images",
    );
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.providerSemanticMeaning).toBe(
      "identity_preservation",
    );
    expect(plan.referenceAdaptation?.[0]?.semanticPreservationOnWire).toBe(true);
  });

  it("D — selected_only projection keeps provenance, omits sibling routes", () => {
    const deps = resolveCdfPhaseDependencies("social-media", "output");
    const routesDep = deps.find((d) => d.phaseId === "routes");
    expect(routesDep?.requiredRole).toBe("selected");
    expect(routesDep?.artifactProjectionMode).toBe("selected_only");

    const gen = minimalGeneration();
    const projected = projectUpstreamArtifactDataForGeneration({
      upstream: gen.upstreamArtifacts[0]!,
      selectedChoices: gen.selectedSemanticChoices!,
      projectionMode: "selected_only",
    });
    expect(projected.projectedSelectedOnly).toBe(true);
    expect((projected.data.routes as unknown[]).length).toBe(1);
    expect((projected.data.routes as Array<{ name: string }>)[0]?.name).toBe(
      "The Sunflower Metaphor",
    );
    expect(projected.siblingChoiceCount).toBe(3);

    const cmr = compileCanonicalModelRequestFromGeneration(gen, {});
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("The Sunflower Metaphor");
    expect(flat).toContain("ProjectionMode: selected_only");
    expect(flat).toMatch(/provenance only/i);
    expect(flat).not.toContain("Blossoming Introduction");
    expect(flat).not.toContain("Five Pillars");
    // Provenance identity retained
    expect(flat).toContain("cdfart_routes");
  });

  it("E — concrete feed-post deliverable semantics, not OR-list catch-all", () => {
    const semantics = composeDeliverableSemantics({
      deliverableLabel: "Social Media Creative",
      phaseName: "Creative",
      generationModality: "image",
      productGrounding: { platform: "instagram", format: "feed-post" },
      fallbackExampleDeliverable:
        "Production-ready social post, story, reel, carousel or banner at platform dimensions",
    });
    expect(semantics.source).toBe("product_grounding_and_contract");
    expect(semantics.concreteLabel).toBe("Instagram Feed Post");
    expect(semantics.statement).toContain("Instagram Feed Post");
    expect(semantics.statement).not.toMatch(/story, reel, carousel/i);

    const cmr = compileCanonicalModelRequestFromGeneration(minimalGeneration(), {
      outputRequirements: {
        deliverable: semantics.concreteLabel,
        kind: "image",
        modalities: ["image"],
        mockupRole: "optional",
        lines: [
          `Deliverable: ${semantics.concreteLabel}`,
          `Deliverable semantics: ${semantics.statement}`,
        ],
        promptBlock: `[Output requirements]\nDeliverable: ${semantics.concreteLabel}\nDeliverable semantics: ${semantics.statement}`,
      },
    });
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("Instagram Feed Post");
    expect(flat).not.toMatch(/post, story, reel, carousel or banner/i);
  });

  it("F — production constraints remain technical / not creative authority", () => {
    const cmr = compileCanonicalModelRequestFromGeneration(minimalGeneration(), {
      productionSpec: {
        productionRuleId: "instagram.feed.square",
        contentHash: "abc",
        text: "[production_constraints]\nCanvas: 1080×1080",
        authorityStatus: "D",
        edition: "1",
        provenance: "format-spec",
        version: "1",
        sections: [],
      },
    });
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("TECHNICAL PRODUCTION CONSTRAINTS ONLY");
    expect(flat).toContain("SELECTED SEMANTIC DIRECTION");
    expect(flat.indexOf("CURRENT USER INSTRUCTION")).toBeLessThan(
      flat.indexOf("PRODUCTION SPEC"),
    );
    expect(flat.indexOf("SELECTED SEMANTIC DIRECTIONS")).toBeLessThan(
      flat.indexOf("PRODUCTION SPEC"),
    );
  });

  it("G — full chain: instruction → deliverable → direction → brand → role", () => {
    const gen = minimalGeneration({
      multimodalContext: selectMultimodalContext({
        descriptors: descriptorsFromExecutionMetadata({
          logoAssetId: "logo1",
          assets: [
            {
              assetId: "logo1",
              mimeType: "image/png",
              url: `data:image/png;base64,${TINY_PNG}`,
            },
          ],
        }),
        organizationId: "org",
      }),
    });
    const cmr = compileCanonicalModelRequestFromGeneration(gen, {});
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("introductory Instagram post");
    expect(flat).toContain("Instagram Feed Post");
    expect(flat).toContain("The Sunflower Metaphor");
    expect(flat).toContain("Sunflower");
    expect(flat).toContain("semanticReferenceRole: identity_mark");
    expect(flat).toContain(
      "Production Spec supplies technical constraints only",
    );
  });
});
