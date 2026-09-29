/**
 * Provider reference semantics boundary — generic capability registry + wire adaptation.
 */

import { composeDeliverableSemantics } from "../../../../src/platform/cdf/generation-context/compose-deliverable-semantics";
import { compileCanonicalModelRequestFromGeneration } from "../../../../src/platform/cdf/generation-context/compile-model-request";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../../src/platform/ai/canonical-model-request/flatten-labeled";
import {
  adaptCanonicalReferenceForProvider,
  buildReferenceAdaptationPlansForProvider,
} from "../../../../src/platform/providers/image/common/adapt-provider-reference";
import {
  resolveProviderReferenceRoleCapability,
} from "../../../../src/platform/providers/image/configs/provider-reference-capabilities";
import { IdeogramImageProtocol } from "../../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { RecraftImageProtocol } from "../../../../src/platform/providers/image/recraft/recraft-image-protocol";
import { IDEOGRAM_IMAGE_SPEC } from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import {
  buildProductionPromptBlock,
  resolveProductionRule,
} from "../../../../src/platform/config/format-production-spec";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { CanonicalGenerationRequest } from "../../../../src/platform/cdf/generation-context/types";
import type { MultimodalReferenceRole } from "../../../../src/platform/ai/multimodal-context/reference-role";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ideogramPlan(role: MultimodalReferenceRole) {
  const protocol = new IdeogramImageProtocol();
  const request: ProviderExecutionRequest = {
    requestId: "req",
    providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
    modelId: "ideogram-3",
    capabilityId: "image.generate" as never,
    payload: {
      prompt: "Create a finished Instagram Feed Post for Sunflower.",
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: role,
      },
    },
    metadata: { logoAssetId: "logo1", brandLogoAssetId: "logo1" },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
  return protocol.buildGenerateRequest({
    spec: IDEOGRAM_IMAGE_SPEC,
    request,
    wireModelId: "ideogram-3",
  });
}

describe("provider reference semantics boundary", () => {
  it("A — identity_mark never maps to style_reference semantics on Ideogram wire", () => {
    const plan = ideogramPlan("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.providerSemanticMeaning).toBe(
      "identity_preservation",
    );
    expect(plan.referenceAdaptation?.[0]?.providerSemanticMeaning).not.toBe(
      "style_transfer",
    );
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "character_reference_images",
    );
    expect(plan.request.form?.files?.[0]?.fieldName).not.toBe(
      "style_reference_images",
    );
    expect(plan.referenceRoleObservability?.providerReferenceRolePreserved).toBe(
      true,
    );
    expect(plan.referenceRoleObservability?.providerSemanticMeaning).toBe(
      "identity_preservation",
    );
  });

  it("B — style_reference remains style_transfer on Ideogram", () => {
    const plan = ideogramPlan("style_reference");
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("style_reference");
    expect(plan.referenceAdaptation?.[0]?.providerSemanticMeaning).toBe(
      "style_transfer",
    );
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "style_reference_images",
    );
  });

  it("C — product_reference uses character channel on Ideogram", () => {
    const adapt = adaptCanonicalReferenceForProvider({
      vendor: "ideogram",
      role: "product_reference",
    });
    expect(adapt.providerSemanticMeaning).toBe("product_depiction");
    expect(adapt.providerTransport?.fieldName).toBe("character_reference_images");
  });

  it("D — subject_reference uses character channel on Ideogram", () => {
    const adapt = adaptCanonicalReferenceForProvider({
      vendor: "ideogram",
      role: "subject_reference",
    });
    expect(adapt.referenceBehavior).toBe("preserve_subject_identity");
    expect(adapt.providerTransport?.fieldName).toBe("character_reference_images");
  });

  it("E — provider may use provider-specific transport without changing canonical role", () => {
    const plans = buildReferenceAdaptationPlansForProvider({
      vendor: "ideogram",
      roles: ["identity_mark"],
    });
    expect(plans[0]?.canonicalRole).toBe("identity_mark");
    expect(plans[0]?.providerTransport?.fieldName).toBe(
      "character_reference_images",
    );
  });

  it("F — Recraft identity_mark is explicitly unsupported on wire (prompt-only)", () => {
    const adapt = adaptCanonicalReferenceForProvider({
      vendor: "recraft",
      role: "identity_mark",
    });
    expect(adapt.mappingExplicitlyUnsupported).toBe(true);
    expect(adapt.deliverBytes).toBe(false);
    expect(adapt.providerSemanticMeaning).toBe("prompt_only");

    const plan = new RecraftImageProtocol().buildGenerateRequest({
      spec: {
        vendor: "recraft",
        wireModelId: "recraftv3",
        inventoryModelId: "recraftv3",
        canonicalProviderId: "provider.recraft",
      } as never,
      wireModelId: "recraftv3",
      request: {
        requestId: "r",
        providerId: "provider.recraft" as never,
        modelId: "recraftv3",
        capabilityId: "image.generate" as never,
        payload: {
          prompt: "post",
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
    expect(plan.request.body?.style_reference_urls).toBeUndefined();
    expect(String(plan.request.body?.prompt)).toContain(
      "PROVIDER REFERENCE LIMITATION",
    );
    expect(plan.referenceRoleObservability?.mappingExplicitlyUnsupported).toBe(
      true,
    );
  });

  it("G — provider_technical production spec excludes creative VFG sections", () => {
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "feed-post",
    });
    expect(resolved).toBeTruthy();
    const technical = buildProductionPromptBlock({
      rule: resolved!.rule,
      projection: "provider_technical",
    });
    const full = buildProductionPromptBlock({
      rule: resolved!.rule,
      projection: "audit_full",
    });
    expect(technical.text).not.toMatch(/Visual Field Guide — Identity/i);
    expect(technical.text).not.toMatch(/Make one idea worth stopping for/i);
    expect(technical.text).not.toMatch(/wordmark\/logo intact/i);
    expect(full.text).toMatch(/Visual Field Guide — Identity/i);
    expect(technical.text).toMatch(/Canvas:/);
    expect(technical.text).toMatch(/1080/);
  });

  it("H — deliverable semantics are concrete from product grounding", () => {
    const semantics = composeDeliverableSemantics({
      deliverableLabel: "Social Media Creative",
      generationModality: "image",
      productGrounding: { platform: "instagram", format: "feed-post" },
    });
    expect(semantics.concreteLabel).toBe("Instagram Feed Post");
    expect(semantics.statement).toMatch(/Create a finished Instagram Feed Post/);
    expect(semantics.statement).not.toMatch(/post, story, reel/i);
  });

  it("I — selected direction not duplicated in upstream flatten projection", () => {
    const gen: CanonicalGenerationRequest = {
      currentUserInstruction: "Create an introductory Instagram post.",
      requirements: [],
      constraints: [],
      exclusions: [],
      selections: [],
      approvedDecisions: [],
      selectedSemanticChoices: [
        {
          phaseId: "routes",
          artifactId: "cdfart_routes",
          version: 1,
          artifactKey: "social-media.routes",
          selectedRouteIndex: 0,
          optionNumber: 1,
          label: "Blooming Introduction",
          choiceArrayKey: "routes",
          choice: {
            name: "Blooming Introduction",
            creativeIdea: "Introduce Sunflower holistically",
            useContextIntent: "Instagram feed introductory post",
          },
          semanticFieldNames: ["name", "creativeIdea", "useContextIntent"],
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
          entryMessage: "Creative output",
          description: "Creative output",
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
          dataBytes: 1000,
          artifactProjectionMode: "selected_only",
          data: {
            routes: [
              {
                name: "Blooming Introduction",
                creativeIdea: "Introduce Sunflower holistically",
              },
              { name: "Sibling Route" },
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
    };
    const cmr = compileCanonicalModelRequestFromGeneration(gen, {});
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(flat).toContain("SELECTED SEMANTIC DIRECTIONS");
    expect(flat).toContain("creativeIdea: Introduce Sunflower holistically");
    expect(flat).toMatch(/provenance only/i);
    expect(flat).not.toContain("Sibling Route");
    const upstreamSection = flat.split("===== UPSTREAM ARTIFACTS =====")[1]?.split(
      "=====",
    )[0];
    expect(upstreamSection).not.toContain("Introduce Sunflower holistically");
  });

  it("J — E2E readiness fixture: identity_mark at final Ideogram adapter boundary", () => {
    const capability = resolveProviderReferenceRoleCapability({
      vendor: "ideogram",
      role: "identity_mark",
    });
    expect(capability?.actsAsStyleTemplate).toBe(false);
    expect(capability?.providerSemanticMeaning).toBe("identity_preservation");

    const plan = ideogramPlan("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.semanticPreservationOnWire).toBe(true);
    expect(plan.referenceRoleObservability?.providerSemanticMeaning).not.toBe(
      "style_transfer",
    );
  });
});
