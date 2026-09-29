/**
 * Final image capability contract — declarative registry, fanout vs routing,
 * TEXT_TO_IMAGE ≠ ON_ASSET_TEXT, provider-success ≠ structural compliance.
 * No live provider calls.
 */

import {
  auditImageProviderCapabilityClaims,
  classifyImageCapabilityClaim,
  listReferenceCapableImageProviderIds,
  listReferenceImageProviderIds,
  providerDeclaresVerifiedOnAssetTextFidelity,
  providerHasImageCapability,
  providerSupportsOnAssetText,
  providerSupportsReferenceImage,
  textPromptAcceptanceIsNotRenderedTextFidelity,
  verifiedImageSpecForProvider,
} from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import {
  isSyncVendorExecutableImageSpec,
  OPENAI_IMAGE_SPEC,
  VERIFIED_IMAGE_PROVIDER_SPECS,
} from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import {
  deriveExecutionCapabilityRequirements,
  filterProvidersByHardCapabilities,
  softRankProviderPreferences,
  UNDECLARED_HARD_CAPABILITY_POLICY,
} from "../../../src/platform/cdf/generation-context/execution-capability-requirements";
import { planImageGenerationFanout } from "../../../src/platform/generation/generation-fanout";
import {
  classifyImageDeliverableOutcomePlanes,
  resolveGeneratedDeliverablePresentationEligibility,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";
import type { DeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

const LIVE = [
  "provider.openai",
  "provider.google",
  "provider.ideogram",
  "provider.recraft",
] as const;

function onAssetContract(): DeliverableCompositionContract {
  return {
    kind: "social_creative",
    communicationMode: "single_frame_communication",
    requiredElements: ["primary_message", "brand_signature"],
    hierarchy: [
      { role: "primary_message", required: true },
      { role: "brand_signature", required: true },
    ],
    textPolicy: { required: true, placement: "on_asset" },
    brandIntegration: { markRole: "signature" },
  } as DeliverableCompositionContract;
}

describe("image capability contract — no providerId runtime branches", () => {
  it("OpenAI REFERENCE_IMAGE comes from OPENAI_IMAGE_SPEC, not id === openai", () => {
    const spec = verifiedImageSpecForProvider("provider.openai");
    expect(spec).toBe(OPENAI_IMAGE_SPEC);
    expect(spec?.supportsReferenceImage).toBe(true);
    expect(providerSupportsReferenceImage("provider.openai")).toBe(true);
    expect(classifyImageCapabilityClaim("provider.openai", "REFERENCE_IMAGE")).toBe(
      "verified",
    );
    expect(isSyncVendorExecutableImageSpec(OPENAI_IMAGE_SPEC)).toBe(false);
    expect(
      VERIFIED_IMAGE_PROVIDER_SPECS.some(
        (s) => s.canonicalProviderId === "provider.openai",
      ),
    ).toBe(false);
  });

  it("listReferenceImageProviderIds is registry-derived (includes OpenAI via spec)", () => {
    const ids = listReferenceImageProviderIds();
    expect(ids).toEqual(
      expect.arrayContaining([
        "provider.openai",
        "provider.ideogram",
        "provider.google",
        "provider.recraft",
      ]),
    );
    // No silent inject — every id has a verified+supportsReferenceImage spec
    for (const id of ids) {
      const spec = verifiedImageSpecForProvider(id);
      expect(spec?.vendorApiVerified).toBe(true);
      expect(spec?.supportsReferenceImage).toBe(true);
    }
  });

  it("TEXT_TO_IMAGE does not imply ON_ASSET_TEXT", () => {
    expect(textPromptAcceptanceIsNotRenderedTextFidelity()).toBe(true);
    for (const id of LIVE) {
      expect(providerHasImageCapability(id, "TEXT_TO_IMAGE")).toBe(true);
      expect(providerSupportsOnAssetText(id)).toBe(false);
      expect(classifyImageCapabilityClaim(id, "ON_ASSET_TEXT")).toBe("undeclared");
      expect(providerDeclaresVerifiedOnAssetTextFidelity(id)).toBe(false);
    }
  });

  it("capability matrix — LIVE providers", () => {
    const rows = auditImageProviderCapabilityClaims([...LIVE]);
    const by = (providerId: string, capability: string) =>
      rows.find((r) => r.providerId === providerId && r.capability === capability);

    for (const id of LIVE) {
      expect(by(id, "TEXT_TO_IMAGE")?.claim).toBe("verified");
      expect(by(id, "REFERENCE_IMAGE")?.claim).toBe("verified");
      expect(by(id, "ON_ASSET_TEXT")?.claim).toBe("undeclared");
      expect(by(id, "ON_ASSET_TEXT")?.hasCapability).toBe(false);
    }

    expect(by("provider.google", "IMAGE_EDIT")?.claim).toBe("verified");
    expect(by("provider.openai", "IMAGE_EDIT")?.claim).toBe("verified");
    expect(by("provider.ideogram", "IMAGE_EDIT")?.claim).toBe("unsupported");
    expect(by("provider.recraft", "IMAGE_EDIT")?.claim).toBe("unsupported");

    expect(listReferenceCapableImageProviderIds()).toEqual(
      expect.arrayContaining(["provider.google", "provider.openai"]),
    );
    expect(listReferenceCapableImageProviderIds()).not.toContain(
      "provider.ideogram",
    );
  });
});

describe("routing vs intentional fanout", () => {
  it("undeclared ON_ASSET_TEXT hard req degrades to soft (does not empty candidates)", () => {
    expect(UNDECLARED_HARD_CAPABILITY_POLICY).toBe("degrade_to_soft");
    const reqs = deriveExecutionCapabilityRequirements(onAssetContract());
    expect(reqs?.hardCapabilities).toContain("ON_ASSET_TEXT");
    const filtered = filterProvidersByHardCapabilities({
      providerIds: [...LIVE],
      hardCapabilities: reqs!.hardCapabilities,
      providerHasCapability: providerHasImageCapability,
    });
    expect(filtered).toEqual([...LIVE]);
  });

  it("automatic soft-rank can prefer ON_ASSET_TEXT when declared (none today)", () => {
    const ranked = softRankProviderPreferences({
      preferences: LIVE.map((providerId) => ({ providerId })),
      soft: { preferOnAssetTextCapable: true, preferReferenceCapable: false },
      providerHasCapability: providerHasImageCapability,
    });
    // No provider declares ON_ASSET_TEXT → stable order unchanged
    expect(ranked.map((p) => p.providerId)).toEqual([...LIVE]);
  });

  it("intentional fanout preserves ChatGPT + two Gemini even when ON_ASSET undeclared", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      executableProviderIds: new Set([
        "provider.openai",
        "provider.google",
        "provider.ideogram",
      ]),
      groupId: "fanout_test",
    });
    expect(plan.targets.map((t) => t.providerId)).toEqual([
      "provider.openai",
      "provider.google",
      "provider.google",
    ]);
    expect(plan.targets.map((t) => t.modelId)).toEqual([
      "gpt-image-2.5-sunburst",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
    ]);
    expect(plan.disableCrossProviderFailover).toBe(true);
  });

  it("structural acceptance remains independent of capability claims", () => {
    // Ideogram has TEXT_TO_IMAGE verified but ON_ASSET undeclared — still may
    // generate media that fails structural verification.
    expect(providerHasImageCapability("provider.ideogram", "TEXT_TO_IMAGE")).toBe(
      true,
    );
    expect(providerSupportsOnAssetText("provider.ideogram")).toBe(false);

    const rejected = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_32_ideogram",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
      cdfCanonicalRejected: true,
      structuralStatus: "NON_COMPLIANT",
      blocksCanonicalCompletion: true,
      rawMediaArtifactIds: ["art_syncimg_82_0"],
      provider: "provider.ideogram",
      model: "ideogram-3",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rawMediaPresent).toBe(true);
    expect(rejected.outcomePlanes).toEqual({
      providerGeneration: "PROVIDER_GENERATION_SUCCESS",
      structuralVerification: "STRUCTURAL_NON_COMPLIANCE",
      canonicalCompletion: "CANONICAL_BLOCKED",
      presentation: "PRESENTATION_REJECTED",
    });
  });

  it("provider operational failure is distinct from structural rejection", () => {
    const failed = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_35_openai",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      productCompletionBlockReason: "failed at provider_runtime: OpenAI HTTP 429",
      rawMediaArtifactIds: [],
      provider: "provider.openai",
      model: "gpt-image-2",
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.outcomePlanes).toEqual({
      providerGeneration: "PROVIDER_OPERATIONAL_FAILURE",
      structuralVerification: "NOT_RUN",
      canonicalCompletion: "NOT_CREATED",
      presentation: "PRESENTATION_FAILED",
    });

    const planes = classifyImageDeliverableOutcomePlanes({
      presentationStatus: "FAILED",
      rawMediaPresent: false,
    });
    expect(planes.providerGeneration).toBe("PROVIDER_OPERATIONAL_FAILURE");
    expect(planes.structuralVerification).toBe("NOT_RUN");
  });
});
