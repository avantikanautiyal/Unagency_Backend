/**
 * Phase 14.9A — Required communication value integrity.
 *
 * Required on-asset RRC surfaces must carry exact authoritative values with
 * provenance, or fail closed before provider invocation. No placeholders.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  isBrandMarkElement,
  isRenderedCommunicationElement,
  resolveDeliverableCompositionContract,
  requiredRenderedCommunicationElements,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  compileDeliverableComposition,
} from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import {
  assertRequiredCommunicationValuesResolved,
  assertRequiredOnAssetCompositionInCmr,
  buildRequiredRenderedCommunication,
} from "../../../src/platform/cdf/generation-context/composition-authority";
import { resolveDeliverableCompositionForPhase } from "../../../src/platform/cdf/generation-context/resolve-deliverable-composition";
import {
  assembleCanonicalModelRequest,
} from "../../../src/platform/cdf/generation-context/compile-model-request";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";

const EXACT_MESSAGE =
  "Hello! We help every learner build strong foundations and grow with confidence.";

function baseGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction:
      "Create an introductory brand post with the required message on the asset.",
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
      format: "single-frame",
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
          primaryMessage: EXACT_MESSAGE,
          visualConcept: "Abstract botanical growth metaphor",
          brandIntegration: "Corner colour-consistent signature mark",
          identityMarkRole: "Small corner signature only",
        },
        semanticFieldNames: [
          "name",
          "primaryMessage",
          "visualConcept",
          "brandIntegration",
          "identityMarkRole",
        ],
      },
    ],
    cdfContext: {
      contextId: "ctx_phase149a",
      contextHash: "hash149a",
      sessionId: "sess149a",
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
        outputLabel: "Visual Creative",
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
    generationContextHash: "genhash149a",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("Phase 14.9A — TEST A exact resolved required message", () => {
  it("RRC carries exact authoritative message with provenance", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const generation = baseGeneration();
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      brandContext: generation.brandContext,
      generationModality: "image",
    });

    expect(compiled.requiredRenderedCommunication.active).toBe(true);
    expect(compiled.requiredRenderedCommunication.allRequiredResolved).toBe(true);
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toEqual({
      element: "primary_message_surface",
      resolutionStatus: "resolved",
      text: EXACT_MESSAGE,
      provenance: "selected_semantic_direction",
      required: true,
      semanticClass: "required_rendered_communication",
    });
  });
});

describe("Phase 14.9A — TEST B unresolved required message fails closed", () => {
  it("fails when primary_message_surface cannot be resolved", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const generation = baseGeneration({
      currentUserInstruction: "",
      selectedSemanticChoices: [
        {
          ...baseGeneration().selectedSemanticChoices![0]!,
          choice: {
            visualConcept: "Abstract shape only",
            identityMarkRole: "Corner mark",
            brandIntegration: "Signature only",
            // no primaryMessage / headlineAngle / communicationObjective
          },
        },
      ],
    });
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: "",
      brandContext: generation.brandContext,
      generationModality: "image",
    });

    expect(compiled.requiredRenderedCommunication.active).toBe(true);
    expect(compiled.requiredRenderedCommunication.allRequiredResolved).toBe(false);
    expect(
      compiled.requiredRenderedCommunication.surfaces.some(
        (s) =>
          s.element === "primary_message_surface" &&
          s.resolutionStatus === "unresolved",
      ),
    ).toBe(true);

    const valueCheck = assertRequiredCommunicationValuesResolved({
      contract,
      compiled,
    });
    expect(valueCheck.ok).toBe(false);
    if (!valueCheck.ok) {
      expect(valueCheck.code).toBe("CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT");
    }

    // Assembling CMR without values still fails the CMR invariant (provider gate).
    const cmr = assembleCanonicalModelRequest(generation, {
      metadata: {},
      deliverableComposition: compiled,
    });
    const invariant = assertRequiredOnAssetCompositionInCmr({
      compositionRequired: true,
      contract,
      compiled,
      modelRequest: cmr,
    });
    expect(invariant.ok).toBe(false);
  });
});

describe("Phase 14.9A — TEST C placeholder rejection", () => {
  it("CMR invariant rejects unresolved and non-authoritative provenance surfaces", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const generation = baseGeneration();
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      generationModality: "image",
    });

    // Builder never emits placeholder success text.
    const built = buildRequiredRenderedCommunication({
      contract,
      filledSlots: [],
    });
    expect(built.allRequiredResolved).toBe(false);
    expect(
      built.surfaces.every((s) => s.resolutionStatus === "unresolved"),
    ).toBe(true);
    expect(JSON.stringify(built)).not.toContain(
      "(required — fill from authoritative creative direction or user instruction)",
    );

    // Legacy anti-pattern: pretend placeholder prose is a resolved surface
    // with deliverable_contract provenance — must fail closed.
    const poisonedCompiled = {
      ...compiled,
      requiredRenderedCommunication: {
        ...compiled.requiredRenderedCommunication,
        allRequiredResolved: true,
        unresolvedElements: [] as string[],
        surfaces: [
          {
            element: "primary_message_surface",
            resolutionStatus: "resolved" as const,
            text: "(required — fill from authoritative creative direction or user instruction)",
            provenance: "deliverable_contract" as const,
            required: true as const,
            semanticClass: "required_rendered_communication" as const,
          },
        ],
      },
    };
    expect(
      assertRequiredCommunicationValuesResolved({
        contract,
        compiled: poisonedCompiled,
      }).ok,
    ).toBe(false);

    const cmr = assembleCanonicalModelRequest(generation, {
      metadata: {},
      deliverableComposition: poisonedCompiled,
    });
    expect(
      assertRequiredOnAssetCompositionInCmr({
        compositionRequired: true,
        contract,
        compiled: poisonedCompiled,
        modelRequest: cmr,
      }).ok,
    ).toBe(false);
  });
});

describe("Phase 14.9A — TEST D brand mark does not satisfy message", () => {
  it("identity_mark alone does not resolve primary_message_surface", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    expect(isBrandMarkElement("identity_mark")).toBe(true);
    expect(isRenderedCommunicationElement("identity_mark")).toBe(false);

    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: {
        phaseId: "routes",
        artifactId: "a",
        version: 1,
        artifactKey: "k",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "r",
        choiceArrayKey: "routes",
        choice: {
          identityMarkRole: "Large centered wordmark",
          brandIntegration: "Wordmark as hero",
          visualConcept: "Logo lockup on cream",
        },
        semanticFieldNames: [
          "identityMarkRole",
          "brandIntegration",
          "visualConcept",
        ],
      },
      currentUserInstruction: "",
      generationModality: "image",
    });

    expect(
      compiled.requiredRenderedCommunication.surfaces.find(
        (s) => s.element === "primary_message_surface",
      )?.resolutionStatus,
    ).toBe("unresolved");
    expect(
      assertRequiredCommunicationValuesResolved({ contract, compiled }).ok,
    ).toBe(false);
  });
});

describe("Phase 14.9A — TEST E user instruction authority", () => {
  it("exact user instruction reaches RRC when it is the authoritative source", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const instruction =
      "Render exactly: Welcome to Acme — learning that grows with every child.";
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: {
        phaseId: "routes",
        artifactId: "a",
        version: 1,
        artifactKey: "k",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "r",
        choiceArrayKey: "routes",
        choice: {
          visualConcept: "Warm illustrated scene",
          brandIntegration: "Corner signature",
        },
        semanticFieldNames: ["visualConcept", "brandIntegration"],
      },
      currentUserInstruction: instruction,
      generationModality: "image",
    });

    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toEqual({
      element: "primary_message_surface",
      resolutionStatus: "resolved",
      text: instruction,
      provenance: "current_user_instruction",
      required: true,
      semanticClass: "required_rendered_communication",
    });
  });
});

describe("Phase 14.9A — TEST F selected semantic direction provenance", () => {
  it("selected direction supplies required value with provenance", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const generation = baseGeneration();
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface?.resolutionStatus).toBe("resolved");
    if (surface?.resolutionStatus === "resolved") {
      expect(surface.provenance).toBe("selected_semantic_direction");
      expect(surface.text).toBe(EXACT_MESSAGE);
    }
  });
});

describe("Phase 14.9A — TEST G end-to-end survival", () => {
  it("exact required communication survives contract → RRC → CMR → flatten", () => {
    const resolution = resolveDeliverableCompositionForPhase({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(resolution.required).toBe(true);
    const contract = resolution.contract!;
    expect(requiredRenderedCommunicationElements(contract)).toContain(
      "primary_message_surface",
    );

    const generation = baseGeneration();
    const compiled = compileDeliverableComposition({
      deliverableKind: resolution.deliverableKind!,
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      brandContext: generation.brandContext,
      generationModality: "image",
    });
    expect(
      assertRequiredCommunicationValuesResolved({ contract, compiled }).ok,
    ).toBe(true);

    const cmr = assembleCanonicalModelRequest(generation, {
      metadata: {},
      deliverableComposition: compiled,
    });
    expect(
      assertRequiredOnAssetCompositionInCmr({
        compositionRequired: true,
        contract,
        compiled,
        modelRequest: cmr,
      }).ok,
    ).toBe(true);

    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain(EXACT_MESSAGE);
    expect(flat).toContain("provenance=selected_semantic_direction");
    expect(flat).not.toContain(
      "(required — fill from authoritative creative direction or user instruction)",
    );
  });
});

describe("Phase 14.9A — Exec42-class + sunflower/bloomsip-class preservation", () => {
  it("Exec42-class fixture has RRC with actual required message", () => {
    const resolution = resolveDeliverableCompositionForPhase({
      serviceId: "social-media",
      phaseId: "output",
    });
    const contract = resolution.contract!;
    const message =
      "Sunflower nurtures every aspect of a child's development—helping them build strong foundations, grow confidently, and flourish in all areas of life.";
    const generation = baseGeneration({
      selectedSemanticChoices: [
        {
          ...baseGeneration().selectedSemanticChoices![0]!,
          choice: {
            primaryMessage: message,
            visualConcept: "Illustrated sunflower metaphor",
            avoidances: "Avoid unnecessary decorative text.",
            brandIntegration: "Corner signature",
          },
        },
      ],
    });
    const compiled = compileDeliverableComposition({
      deliverableKind: resolution.deliverableKind!,
      contract,
      selectedChoice: generation.selectedSemanticChoices![0],
      currentUserInstruction: generation.currentUserInstruction,
      generationModality: "image",
    });
    expect(compiled.requiredRenderedCommunication.active).toBe(true);
    expect(compiled.requiredRenderedCommunication.allRequiredResolved).toBe(true);
    expect(
      compiled.requiredRenderedCommunication.surfaces.find(
        (s) => s.element === "primary_message_surface",
      ),
    ).toMatchObject({
      resolutionStatus: "resolved",
      text: message,
    });

    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      assembleCanonicalModelRequest(generation, {
        metadata: {},
        deliverableComposition: compiled,
      }),
    );
    expect(flat).toContain("===== DELIVERABLE COMPOSITION =====");
    expect(flat).toContain(message);
  });

  it("sunflower/bloomsip-class exact messages survive flatten", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    for (const primary of [
      "Hello! We're Example Brand – a fresh approach for learners everywhere",
      "Transform your everyday refresh with real botanicals and sparkling sophistication—meet ExampleSip.",
    ]) {
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
        generationModality: "image",
      });
      const flat = flattenCanonicalModelRequestToLabeledPrompt(
        assembleCanonicalModelRequest(generation, {
          metadata: {},
          deliverableComposition: compiled,
        }),
      );
      expect(flat).toContain(primary);
      expect(flat).toContain("Text policy: placement=on_asset, required=true");
    }
  });
});

describe("Phase 14.9A — static architecture audit", () => {
  it("production changes have no service/provider/platform semantic branches", () => {
    const files = [
      "composition-authority.ts",
      "compile-deliverable-composition.ts",
    ].map((f) =>
      path.resolve(
        __dirname,
        `../../../src/platform/cdf/generation-context/${f}`,
      ),
    );
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/if\s*\(\s*serviceId\s*===/);
      expect(src).not.toMatch(/if\s*\(\s*phaseId\s*===/);
      expect(src).not.toMatch(/if\s*\(\s*provider\s*===/);
      expect(src).not.toMatch(/if\s*\(\s*platform\s*===/);
      expect(src).not.toMatch(/instagram/i);
      expect(src).not.toMatch(/ideogram/i);
      expect(src).not.toMatch(
        /\(required — fill from authoritative creative direction/,
      );
    }
  });
});
