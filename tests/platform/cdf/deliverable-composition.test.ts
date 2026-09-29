/**
 * Generic registry-driven deliverable composition semantics.
 */

import {
  resolveDeliverableCompositionContract,
  deliverableCompositionRequiredForPhase,
  DELIVERABLE_KIND_PROFILES,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import {
  compileDeliverableComposition,
  resolveAndCompileDeliverableComposition,
} from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { resolveDeliverableCompositionForPhase } from "../../../src/platform/cdf/generation-context/resolve-deliverable-composition";
import {
  compileCanonicalModelRequestFromGeneration,
} from "../../../src/platform/cdf/generation-context/compile-model-request";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";

function baseGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction: "Introductory brand post describing Sunflower.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "Sunflower",
      facts: [{ key: "brandName", value: "Sunflower" }],
      negatives: [],
      factKeys: ["brandName"],
    },
    productGrounding: {
      platform: "instagram",
      format: "feed-post",
    },
    selectedSemanticChoices: [
      {
        phaseId: "routes",
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "social-media.routes",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "Route 3",
        choiceArrayKey: "routes",
        choice: {
          primaryMessage: "Welcome to Sunflower — everyday warmth.",
          visualConcept: "Woman in a sunflower garden",
          hierarchy: "Headline first, brand signature corner",
          brandIntegration: "Integrated colour palette",
          identityMarkRole: "Corner signature",
        },
        semanticFieldNames: [
          "primaryMessage",
          "visualConcept",
          "hierarchy",
          "brandIntegration",
          "identityMarkRole",
        ],
      },
    ],
    cdfContext: {
      contextId: "ctx1",
      contextHash: "hash1",
      sessionId: "sess1",
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
    generationContextHash: "genhash",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("DeliverableCompositionContract — registry", () => {
  it("1 — registry resolves social_creative composition", () => {
    const c = resolveDeliverableCompositionContract("social_creative");
    expect(c).not.toBeNull();
    expect(c!.communicationMode).toBe("single_frame_communication");
    expect(c!.requiredElements).toContain("primary_message_surface");
    expect(c!.requiredElements).toContain("visual_subject");
    expect(c!.requiredElements).toContain("brand_signature");
  });

  it("2 — registry resolves campaign_kv composition", () => {
    const c = resolveDeliverableCompositionContract("campaign_kv");
    expect(c).not.toBeNull();
    expect(c!.communicationMode).toBe("multi_zone_layout");
    expect(c!.requiredElements).toContain("message_hierarchy");
  });

  it("3 — both kinds use the same generic resolver/compiler", () => {
    for (const kind of ["social_creative", "campaign_kv"] as const) {
      const contract = resolveDeliverableCompositionContract(kind)!;
      const compiled = compileDeliverableComposition({
        deliverableKind: kind,
        contract,
        currentUserInstruction: "Test",
        generationModality: "image",
      });
      expect(compiled.deliverableKind).toBe(kind);
      expect(compiled.communicationMode).toBe(contract.communicationMode);
    }
  });

  it("10 — missing composition contract fails closed via resolver", () => {
    const result = resolveAndCompileDeliverableComposition({
      deliverableKind: "text_choice",
      currentUserInstruction: "Test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CDF_DELIVERABLE_COMPOSITION_MISSING");
    }
  });
});

describe("CompiledCreativeComposition — CMR + flatten", () => {
  it("4 — composition compiles into structured CMR data", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      currentUserInstruction: "Intro post",
      productGrounding: { platform: "instagram", format: "feed-post" },
    });
    const cmr = compileCanonicalModelRequestFromGeneration(baseGeneration(), {
      deliverableComposition: compiled,
    });
    const block = cmr.messages
      .flatMap((m) => m.content)
      .find(
        (p) => p.type === "structured" && p.name === "deliverable_composition",
      );
    expect(block).toBeDefined();
    expect((block as { data: Record<string, unknown> }).data.communicationMode).toBe(
      "single_frame_communication",
    );
  });

  it("5 — selected creative direction fills composition slots", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: baseGeneration().selectedSemanticChoices![0],
      currentUserInstruction: "Intro",
    });
    const primary = compiled.filledSlots.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(primary?.source).toBe("creative_direction");
    expect(primary?.value).toContain("Sunflower");
  });

  it("6 — user instruction remains authoritative", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      currentUserInstruction: "Authoritative user line",
    });
    expect(compiled.userInstructionAuthoritative).toBe(true);
    expect(
      compiled.filledSlots.some(
        (s) => s.source === "user_instruction" && s.value.includes("Authoritative"),
      ),
    ).toBe(true);
  });

  it("7 — brand context remains unchanged in slots", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      currentUserInstruction: "Test",
      brandContext: baseGeneration().brandContext,
    });
    expect(
      compiled.filledSlots.some(
        (s) => s.source === "brand_context" && s.value === "Sunflower",
      ),
    ).toBe(true);
  });

  it("9 — provider flatten includes deliverable composition", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: baseGeneration().selectedSemanticChoices![0],
      currentUserInstruction: "Intro",
      productGrounding: { platform: "instagram", format: "feed-post" },
    });
    const cmr = compileCanonicalModelRequestFromGeneration(baseGeneration(), {
      deliverableComposition: compiled,
    });
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("DELIVERABLE COMPOSITION");
    expect(flat).toContain("single_frame_communication");
    expect(flat).toContain("primary_message_surface");
    expect(flat).toContain("Filled composition slots");
  });

  it("16 — composition semantics survive CMR → provider boundary", () => {
    const contract = resolveDeliverableCompositionContract("campaign_kv")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "campaign_kv",
      contract,
      currentUserInstruction: "Campaign KV",
    });
    const cmr = compileCanonicalModelRequestFromGeneration(baseGeneration(), {
      deliverableComposition: compiled,
    });
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("multi_zone_layout");
    expect(flat).toContain("message_hierarchy");
  });

  it("8 — production spec remains separate from deliverable composition in CMR", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      currentUserInstruction: "Intro",
    });
    const cmr = compileCanonicalModelRequestFromGeneration(baseGeneration(), {
      deliverableComposition: compiled,
      productionSpec: {
        productionRuleId: "instagram.feed.square",
        contentHash: "abc",
        text: "Canvas: 1080x1080 px. Colour: sRGB.",
        authorityStatus: "D",
        edition: "1",
        provenance: "test",
        version: "1",
        sections: [],
      },
    });
    const names = cmr.messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === "structured")
      .map((p) => (p as { name: string }).name);
    expect(names).toContain("deliverable_composition");
    expect(names).toContain("production_spec");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("DELIVERABLE COMPOSITION");
    expect(flat).toContain("PRODUCTION SPEC");
    expect(flat).toContain("1080x1080");
    expect(flat).toContain("single_frame_communication");
  });

  it("17 — structural completion is distinct from model-quality evaluation", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      currentUserInstruction: "Test",
    });
    expect(compiled.structuralCompletionNote).toMatch(/not aesthetic quality/i);
    expect(compiled.structuralCompletion.every((c) => c.structural)).toBe(true);
  });
});

describe("Phase resolution — registry-driven, no semantic branches", () => {
  it("resolves social-media output composition from registry", () => {
    const resolution = resolveDeliverableCompositionForPhase({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(resolution.required).toBe(true);
    expect(resolution.contract).not.toBeNull();
    if (resolution.required && resolution.contract) {
      expect(resolution.deliverableKind).toBe("social_creative");
    }
  });

  it("resolves ad-campaigns master-kv via same machinery", () => {
    const resolution = resolveDeliverableCompositionForPhase({
      serviceId: "ad-campaigns",
      phaseId: "master-kv",
    });
    expect(resolution.required).toBe(true);
    expect(resolution.contract?.communicationMode).toBe("multi_zone_layout");
  });

  it("text_choice routes phase does not require composition", () => {
    expect(
      deliverableCompositionRequiredForPhase({
        generationModality: "text",
        uxType: "text_choice",
      }),
    ).toBe(false);
  });

  it("15 — social_creative and campaign_kv share resolver machinery", () => {
    const social = resolveDeliverableCompositionForPhase({
      serviceId: "social-media",
      phaseId: "output",
    });
    const kv = resolveDeliverableCompositionForPhase({
      serviceId: "ad-campaigns",
      phaseId: "master-kv",
    });
    expect(social.required && social.contract).toBeTruthy();
    expect(kv.required && kv.contract).toBeTruthy();
  });
});

describe("All deliverable kinds — composition audit", () => {
  const visualKinds = [
    "social_creative",
    "campaign_kv",
    "print_artwork",
    "pack_flat",
    "pack_3d",
    "logo",
    "logo_system",
    "ui_screen",
    "email_design",
    "posm",
    "merch_artwork",
    "merch_mockup",
    "illustration",
    "storyboard_frame",
    "video",
    "environment_3d",
    "event_identity",
    "generic_visual",
  ] as const;

  it.each(visualKinds)("kind %s has a composition contract", (kind) => {
    expect(resolveDeliverableCompositionContract(kind)).not.toBeNull();
    expect(DELIVERABLE_KIND_PROFILES[kind].composition).not.toBeNull();
  });

  it("execution contract exposes composition for social-media output", () => {
    const exec = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(exec?.requiresDeliverableComposition).toBe(true);
    expect(exec?.deliverableKind).toBe("social_creative");
    expect(exec?.deliverableComposition?.communicationMode).toBe(
      "single_frame_communication",
    );
  });
});
