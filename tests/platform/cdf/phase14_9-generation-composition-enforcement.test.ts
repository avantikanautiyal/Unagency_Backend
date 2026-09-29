/**
 * Phase 14.9 — Generation composition enforcement.
 *
 * Framework-side: required on-asset composition must survive into CMR/flatten
 * as structured REQUIRED_RENDERED_COMMUNICATION, distinct from brand signature
 * and creative direction. Soft lower-authority guidance must not negate it.
 *
 * Does NOT claim provider/model pixel adherence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveDeliverableCompositionContract,
  isBrandMarkElement,
  isRenderedCommunicationElement,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  compileDeliverableComposition,
} from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import {
  assertRequiredOnAssetCompositionInCmr,
  contractRequiresOnAssetCommunication,
  qualifyProductionSpecForRequiredComposition,
  selectedDirectionAuthorityText,
} from "../../../src/platform/cdf/generation-context/composition-authority";
import { resolveDeliverableCompositionForPhase } from "../../../src/platform/cdf/generation-context/resolve-deliverable-composition";
import {
  assembleCanonicalModelRequest,
  compileCanonicalModelRequestFromGeneration,
  detectCanonicalSectionsFromModelRequest,
} from "../../../src/platform/cdf/generation-context/compile-model-request";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";
import type { CanonicalAssemblyEnrichments } from "../../../src/platform/cdf/generation-context/resolve-assembly-enrichments";

function baseGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction: "Create an introductory brand post with the required message on the asset.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "Acme Brand",
      facts: [{ key: "brandName", value: "Acme Brand" }],
      negatives: [],
      factKeys: ["brandName"],
    },
    productGrounding: {
      platform: "generic",
      format: "feed-post",
    },
    selectedSemanticChoices: [
      {
        phaseId: "routes",
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "generic.routes",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Route 1",
        choiceArrayKey: "routes",
        choice: {
          name: "Clear Message Route",
          primaryMessage:
            "Hello! We help every learner build strong foundations and grow with confidence.",
          secondaryMessage: "Learn with us.",
          visualConcept: "Abstract botanical growth metaphor",
          visualTreatment: "Bold minimal composition with ample negative space",
          hierarchy: "Primary message first; brand signature secondary",
          brandIntegration: "Corner colour-consistent signature mark",
          identityMarkRole: "Small corner signature only",
          avoidances:
            "Avoid unnecessary decorative text that clutters the artistic visual.",
          creativeIdea: "Poetic botanical metaphor for growth",
        },
        semanticFieldNames: [
          "name",
          "primaryMessage",
          "secondaryMessage",
          "visualConcept",
          "visualTreatment",
          "hierarchy",
          "brandIntegration",
          "identityMarkRole",
          "avoidances",
          "creativeIdea",
        ],
      },
    ],
    cdfContext: {
      contextId: "ctx_phase149",
      contextHash: "hash149",
      sessionId: "sess149",
      serviceId: "social-media",
      phaseId: "output",
      sessionVersion: 1,
      contextSource: "test",
      status: "active",
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
        refinementScopes: ["artifact", "phase"],
        entryMessage: "Creative output",
        description: "",
        executionStrategy: "canonical",
        outputLabel: "Social Media Creative",
      },
    },
    upstreamArtifacts: [],
    outputContract: {
      serviceId: "social-media",
      phaseId: "output",
      generationModality: "image",
      artifactKey: "social-media.output",
      canonicalFullDeck: false,
      instructions: ["Generate deliverable"],
    },
    generationContextHash: "genhash149",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

function compileSocialCreative() {
  const resolution = resolveDeliverableCompositionForPhase({
    serviceId: "social-media",
    phaseId: "output",
  });
  expect(resolution.required).toBe(true);
  expect(resolution.contract).not.toBeNull();
  const contract = resolution.contract!;
  const generation = baseGeneration();
  const compiled = compileDeliverableComposition({
    deliverableKind: resolution.deliverableKind!,
    contract,
    selectedChoice: generation.selectedSemanticChoices![0],
    currentUserInstruction: generation.currentUserInstruction,
    brandContext: generation.brandContext,
    productGrounding: generation.productGrounding,
    deliverableLabel: generation.cdfContext.phaseContext.outputLabel,
    phaseName: generation.cdfContext.phaseContext.name,
    artifactKey: generation.outputContract.artifactKey,
    generationModality: generation.outputContract.generationModality,
  });
  return { resolution, contract, generation, compiled };
}

describe("Phase 14.9 — Exec42-class CMR composition invariant", () => {
  it("visual phase with on-asset textPolicy compiles deliverable_composition into CMR", () => {
    const { resolution, contract, generation, compiled } = compileSocialCreative();
    expect(contractRequiresOnAssetCommunication(contract)).toBe(true);
    expect(compiled.policies.text.required).toBe(true);
    expect(compiled.policies.text.placement).toBe("on_asset");
    expect(compiled.requiredElements).toContain("primary_message_surface");
    expect(compiled.requiredRenderedCommunication.active).toBe(true);
    expect(compiled.requiredRenderedCommunication.allRequiredResolved).toBe(true);
    expect(
      compiled.requiredRenderedCommunication.surfaces.some(
        (s) =>
          s.element === "primary_message_surface" &&
          s.resolutionStatus === "resolved" &&
          s.text.includes("strong foundations"),
      ),
    ).toBe(true);

    const cmr = assembleCanonicalModelRequest(generation, {
      metadata: {},
      deliverableComposition: compiled,
    });
    const sections = detectCanonicalSectionsFromModelRequest(cmr);
    expect(sections.deliverableComposition).toBe(true);

    const invariant = assertRequiredOnAssetCompositionInCmr({
      compositionRequired: resolution.required,
      contract,
      compiled,
      modelRequest: cmr,
    });
    expect(invariant.ok).toBe(true);
  });

  it("CMR invariant fails when required composition is omitted from enrichments", () => {
    const { resolution, contract, generation } = compileSocialCreative();
    const cmrWithout = compileCanonicalModelRequestFromGeneration(generation);
    const invariant = assertRequiredOnAssetCompositionInCmr({
      compositionRequired: resolution.required,
      contract,
      compiled: null,
      modelRequest: cmrWithout,
    });
    expect(invariant.ok).toBe(false);
    if (!invariant.ok) {
      expect(invariant.code).toBe("CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT");
    }
  });

  it("required primary_message_surface remains a required element after compile", () => {
    const { compiled } = compileSocialCreative();
    expect(compiled.requiredElements).toEqual(
      expect.arrayContaining([
        "primary_message_surface",
        "visual_subject",
        "brand_signature",
      ]),
    );
    expect(compiled.requiredRenderedCommunication.required).toBe(true);
  });
});

describe("Phase 14.9 — semantic role separation", () => {
  it("brand_signature / identity_mark are not required_rendered_communication", () => {
    const { compiled } = compileSocialCreative();
    const rrcElements = new Set(
      compiled.requiredRenderedCommunication.surfaces.map((s) => s.element),
    );
    expect(isBrandMarkElement("brand_signature")).toBe(true);
    expect(isBrandMarkElement("identity_mark")).toBe(true);
    expect(rrcElements.has("brand_signature")).toBe(false);
    expect(rrcElements.has("identity_mark")).toBe(false);
    expect(rrcElements.has("visual_subject")).toBe(false);
    expect(rrcElements.has("primary_message_surface")).toBe(true);

    const brandSlot = compiled.filledSlots.find(
      (s) => s.element === "brand_signature",
    );
    const primarySlot = compiled.filledSlots.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(brandSlot?.value).toBeTruthy();
    expect(primarySlot?.value).toBeTruthy();
    expect(brandSlot!.value).not.toBe(primarySlot!.value);
    expect(compiled.semanticRoleSeparation.brandSignatureDoesNotSatisfyPrimaryMessage).toBe(
      true,
    );
    expect(compiled.semanticRoleSeparation.identityMarkDoesNotSatisfyPrimaryMessage).toBe(
      true,
    );
  });

  it("registry element semantics classify communication vs brand marks", () => {
    expect(isRenderedCommunicationElement("primary_message_surface")).toBe(true);
    expect(isRenderedCommunicationElement("call_to_action")).toBe(true);
    expect(isBrandMarkElement("brand_signature")).toBe(true);
    expect(isBrandMarkElement("identity_mark")).toBe(true);
    expect(isRenderedCommunicationElement("brand_signature")).toBe(false);
  });
});

describe("Phase 14.9 — soft lower-authority guidance", () => {
  it("required communication survives when lower-level decorative-text preference is present", () => {
    const { contract, generation, compiled } = compileSocialCreative();
    expect(compiled.lowerAuthorityQualification?.requiredOnAssetText).toBe(true);

    const productionSpec = qualifyProductionSpecForRequiredComposition(
      {
        productionRuleId: "test.rule",
        contentHash: "abc",
        text: "Visual Field Guide — Good practice\n- Prefer live text for web/email/decks; do not flatten the essential message into one image.\n- Prefer visual clarity.",
        authorityStatus: "D",
        edition: "1.0.0",
        provenance: "test",
        version: "1.0.0",
        sections: [
          {
            id: "good_practice",
            title: "Visual Field Guide — Good practice",
            lines: [
              "Prefer live text for web/email/decks; do not flatten the essential message into one image.",
            ],
          },
        ],
      },
      compiled,
    )!;

    expect(
      productionSpec.sections.some(
        (s) => s.id === "composition_authority_qualification",
      ),
    ).toBe(true);

    const enrichments: CanonicalAssemblyEnrichments = {
      metadata: {},
      productionSpec,
      deliverableComposition: compiled,
    };
    const cmr = assembleCanonicalModelRequest(generation, enrichments);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);

    expect(flat).toContain("===== DELIVERABLE COMPOSITION =====");
    expect(flat).toContain("REQUIRED RENDERED COMMUNICATION");
    expect(flat).toContain("strong foundations");
    expect(flat).toContain("Text policy: placement=on_asset, required=true");
    expect(flat).toMatch(/COMPOSITION AUTHORITY/i);
    expect(flat).toMatch(
      /does not override DELIVERABLE COMPOSITION required elements/i,
    );

    // SSD avoidances may still appear (creative HOW), but composition authority qualifies them.
    expect(flat).toContain("Avoid unnecessary decorative text");
    expect(compiled.lowerAuthorityQualification!.note).toMatch(
      /non-required text/i,
    );
    expect(contractRequiresOnAssetCommunication(contract)).toBe(true);
  });

  it("selected direction authority is scoped to HOW when composition requires on-asset text", () => {
    const text = selectedDirectionAuthorityText({
      compositionPresent: true,
      requiredOnAsset: true,
    });
    expect(text).toMatch(/creative realization \(HOW\)/i);
    expect(text).toMatch(/does not override DELIVERABLE COMPOSITION/i);
    expect(text).not.toMatch(/^SELECTED SEMANTIC DIRECTION is authoritative\./);
  });
});

describe("Phase 14.9 — end-to-end compile → CMR → flatten", () => {
  it("required communication survives every stage structurally", () => {
    const { contract, generation, compiled } = compileSocialCreative();
    const primary =
      "Hello! We help every learner build strong foundations and grow with confidence.";

    // Stage: compiled
    expect(compiled.requiredRenderedCommunication.active).toBe(true);
    expect(
      compiled.requiredRenderedCommunication.surfaces.find(
        (s) => s.element === "primary_message_surface",
      ),
    ).toEqual(
      expect.objectContaining({
        resolutionStatus: "resolved",
        text: primary,
        provenance: "selected_semantic_direction",
        required: true,
        semanticClass: "required_rendered_communication",
      }),
    );

    // Stage: CMR
    const cmr = assembleCanonicalModelRequest(generation, {
      metadata: {},
      deliverableComposition: compiled,
    });
    const part = cmr.messages
      .flatMap((m) => m.content)
      .find(
        (p) => p.type === "structured" && p.name === "deliverable_composition",
      ) as { data: Record<string, unknown> };
    expect(part.data.policies).toEqual(
      expect.objectContaining({
        text: { placement: "on_asset", required: true },
      }),
    );
    const rrc = part.data.requiredRenderedCommunication as {
      active: boolean;
      allRequiredResolved: boolean;
      surfaces: Array<{
        element: string;
        text?: string;
        resolutionStatus: string;
        provenance?: string;
      }>;
    };
    expect(rrc.active).toBe(true);
    expect(rrc.allRequiredResolved).toBe(true);
    expect(
      rrc.surfaces.some(
        (s) =>
          s.text === primary &&
          s.resolutionStatus === "resolved" &&
          s.provenance === "selected_semantic_direction",
      ),
    ).toBe(true);
    expect(part.data.requiredElements).toEqual(
      expect.arrayContaining(["primary_message_surface"]),
    );
    expect(contract.textPolicy?.required).toBe(true);

    // Stage: flatten
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain(primary);
    expect(flat).toContain(
      "[required_rendered_communication] primary_message_surface:",
    );
    expect(flat).toContain("provenance=selected_semantic_direction");
    expect(flat).toContain("Semantic role separation:");
  });
});

describe("Phase 14.9 — no service/provider semantic branches in production changes", () => {
  it("composition-authority and compile paths have no serviceId/provider branches", () => {
    const roots = [
      path.resolve(
        __dirname,
        "../../../src/platform/cdf/generation-context/composition-authority.ts",
      ),
      path.resolve(
        __dirname,
        "../../../src/platform/cdf/generation-context/compile-deliverable-composition.ts",
      ),
    ];
    for (const file of roots) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/if\s*\(\s*serviceId\s*===/);
      expect(src).not.toMatch(/if\s*\(\s*phaseId\s*===/);
      expect(src).not.toMatch(/if\s*\(\s*provider\s*===/);
      expect(src).not.toMatch(/instagram/i);
      expect(src).not.toMatch(/ideogram/i);
    }
  });
});

describe("Phase 14.9 — Phase 14.8 preservation (no flatten regression)", () => {
  it("sunflower/bloomsip-class required text still survives flatten", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const primary =
      "Hello! We're Example Brand – a fresh approach for learners everywhere";
    const generation = baseGeneration({
      selectedSemanticChoices: [
        {
          ...baseGeneration().selectedSemanticChoices![0]!,
          choice: {
            ...baseGeneration().selectedSemanticChoices![0]!.choice,
            primaryMessage: primary,
          },
        },
      ],
    });
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      brandContext: generation.brandContext,
      productGrounding: generation.productGrounding,
      generationModality: "image",
    });
    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      assembleCanonicalModelRequest(generation, {
        metadata: {},
        deliverableComposition: compiled,
      }),
    );
    expect(flat).toContain("===== DELIVERABLE COMPOSITION =====");
    expect(flat).toContain(primary);
    expect(flat).toContain("Text policy: placement=on_asset, required=true");
  });
});
