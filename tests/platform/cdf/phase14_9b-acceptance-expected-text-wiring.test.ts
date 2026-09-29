/**
 * Phase 14.9B/C — Acceptance-gate wiring + fail-closed structural verification.
 */

import {
  resolveDeliverableCompositionContract,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  deriveVisualVerificationRequirements,
} from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  evaluateStructuralCompositionCompliance,
  expectedTextsFromCanonicalModelRequest,
  expectedTextsFromExecutionMetadata,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import {
  planImageGenerationFanout,
  buildGenerationFanoutLeafMetadata,
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  isGenerationFanoutLeafMetadata,
} from "../../../src/platform/generation/generation-fanout";
import { IMAGE_USE_CASE_PREFERENCES } from "../../../src/platform/providers/image/routing/image-use-case-routing";

const REQUIRED_COMMUNICATION =
  "Sunflower is where children discover their voice, build resilience, develop life skills, and grow into confident, capable humans — from grades 1 through 12.";

function cmrWithRequiredRenderedCommunication(text: string) {
  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "structured",
            name: "deliverable_composition",
            data: {
              deliverableKind: "social_creative",
              requiredRenderedCommunication: {
                active: true,
                placement: "on_asset",
                required: true,
                allRequiredResolved: true,
                unresolvedElements: [],
                surfaces: [
                  {
                    element: "primary_message_surface",
                    resolutionStatus: "resolved",
                    text,
                    provenance: "selected_semantic_direction",
                    required: true,
                    semanticClass: "required_rendered_communication",
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

describe("phase14.9b acceptance expected-text wiring (exec_43 forensic)", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;
  const vreqs = deriveVisualVerificationRequirements(contract)!;

  it("extracts exact RRC text from CMR deliverable_composition", () => {
    const cmr = cmrWithRequiredRenderedCommunication(REQUIRED_COMMUNICATION);
    expect(expectedTextsFromCanonicalModelRequest(cmr)).toEqual([
      REQUIRED_COMMUNICATION,
    ]);
  });

  it("execution metadata without selection stamps still yields RRC from CMR", () => {
    const meta = {
      cdfExpectedOnAssetTexts: undefined,
      cdfSelectedPrimaryMessage: undefined,
      cdfSelectedHeadlineAngle: undefined,
      canonicalModelRequest: cmrWithRequiredRenderedCommunication(
        REQUIRED_COMMUNICATION,
      ),
    };
    expect(expectedTextsFromExecutionMetadata(meta)).toEqual([
      REQUIRED_COMMUNICATION,
    ]);
  });

  it("brand-only OCR must block when exact required communication is expected", () => {
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
        renderedTextProof: {
          extractedText: "Sunflower",
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [REQUIRED_COMMUNICATION],
      },
      verificationRequirements: vreqs,
    });
    const match = structural.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(match.status).toBe("NON_COMPLIANT");
    expect(structural.blocksCanonicalCompletion).toBe(true);
  });

  it("exact/normalized match succeeds when OCR covers expected message", () => {
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: REQUIRED_COMMUNICATION,
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [REQUIRED_COMMUNICATION],
      },
      verificationRequirements: vreqs,
    });
    const match = structural.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(match.status).toBe("COMPLIANT");
    expect(structural.blocksCanonicalCompletion).toBe(false);
  });

  it("missing expected messages cannot produce COMPLIANT match", () => {
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: "Sunflower",
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: [],
      },
      verificationRequirements: vreqs,
    });
    const match = structural.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(match.status).not.toBe("COMPLIANT");
    expect(match.status).toBe("UNVERIFIABLE");
  });

  it("OCR producer failure follows acceptanceOnUnmet=block for presence", () => {
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: {
          extractedText: null,
          source: "ocr",
          outcome: "error",
          failureReason: "tesseract_unavailable",
        },
        expectedRenderedTexts: [REQUIRED_COMMUNICATION],
      },
      verificationRequirements: vreqs,
    });
    const presence = structural.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("UNVERIFIABLE");
    expect(presence.acceptanceOnUnmet).toBe("block");
    expect(structural.blocksCanonicalCompletion).toBe(true);
  });

  it("production-shaped ingest wiring: meta→expectedTexts→evaluator blocks brand-only OCR", () => {
    const meta = {
      canonicalModelRequest: cmrWithRequiredRenderedCommunication(
        REQUIRED_COMMUNICATION,
      ),
    };
    const expected = expectedTextsFromExecutionMetadata(meta);
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
        renderedTextProof: {
          extractedText: "Sunflower",
          source: "ocr",
          outcome: "ok",
        },
        expectedRenderedTexts: expected,
      },
      verificationRequirements: vreqs,
    });
    expect(expected).toContain(REQUIRED_COMMUNICATION);
    expect(structural.blocksCanonicalCompletion).toBe(true);
  });
});

describe("generation fanout (generic, not failover)", () => {
  it("resolves fanout targets from declarative IMAGE_USE_CASE_PREFERENCES inventory", () => {
    const useCase = "marketing_creative" as const;
    const inventoryModels = IMAGE_USE_CASE_PREFERENCES[useCase].map(
      (p) => p.modelId,
    );

    const plan = planImageGenerationFanout({
      useCase,
      groupId: "fanout_inventory",
      executableProviderIds: new Set([
        "provider.openai",
        "provider.google",
        "provider.ideogram",
        "provider.recraft",
      ]),
    });

    // Planner must mirror inventory — not orchestration hardcodes.
    expect(plan.targets.map((t) => t.modelId)).toEqual(inventoryModels);
    expect(plan.targets.map((t) => t.modelId)).toEqual([
      "gpt-image-2.5-sunburst",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
    ]);
    expect(plan.disableCrossProviderFailover).toBe(true);
  });

  it("plans ChatGPT + two Gemini models from marketing_creative inventory", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "fanout_test",
      executableProviderIds: new Set([
        "provider.openai",
        "provider.google",
        "provider.ideogram",
        "provider.recraft",
      ]),
    });
    expect(plan.targets).toHaveLength(3);
    expect(plan.targets.map((t) => t.providerId)).toEqual([
      "provider.openai",
      "provider.google",
      "provider.google",
    ]);
    expect(GENERATION_FANOUT_PROVIDER_FAMILIES).toEqual([
      "provider.openai",
      "provider.google",
    ]);
    expect(plan.targets.map((t) => t.modelId)).toEqual([
      "gpt-image-2.5-sunburst",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
    ]);
    expect(plan.disableCrossProviderFailover).toBe(true);
  });

  it("leaf metadata clears failover and pins one provider", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "fanout_test",
      executableProviderIds: new Set([
        "provider.openai",
        "provider.google",
      ]),
    });
    const leaf = buildGenerationFanoutLeafMetadata({
      plan,
      target: plan.targets[0]!,
    });
    expect(leaf.imageFailoverChain).toEqual([]);
    expect(leaf.disableCrossProviderFailover).toBe(true);
    expect(leaf.preferredProviderId).toBe("provider.openai");
    expect(leaf.preferredModelId).toBe("gpt-image-2.5-sunburst");
    expect(isGenerationFanoutLeafMetadata(leaf)).toBe(true);
  });

  it("omits non-executable families without substituting another target", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "fanout_test",
      executableProviderIds: new Set(["provider.openai"]),
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]!.providerId).toBe("provider.openai");
    expect(plan.targets[0]!.modelId).toBe("gpt-image-2.5-sunburst");
  });
});
