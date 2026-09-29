/**
 * Phase 11 — structural proof boundaries + verified capability claims.
 * Prevents treating DECLARED metadata as VERIFIED rendered structure.
 */

import {
  evaluateStructuralCompositionCompliance,
  extractStructuralEvidenceFromCandidate,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  deriveExecutionCapabilityRequirements,
  filterProvidersByHardCapabilities,
  UNDECLARED_HARD_CAPABILITY_POLICY,
} from "../../../src/platform/cdf/generation-context/execution-capability-requirements";
import {
  auditImageProviderCapabilityClaims,
  classifyImageCapabilityClaim,
  providerHasImageCapability,
  providerSupportsOnAssetText,
} from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import { ImageExecutionRouter } from "../../../src/platform/providers/image/routing/image-execution-router";
import type { IProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";

function mockRegistry(providerIds: string[]): IProviderRuntimeRegistry {
  return {
    listAvailableProviderIds: () => providerIds,
    resolveAvailable: (id: string) =>
      providerIds.includes(String(id))
        ? { capabilities: ["image.generate"] }
        : undefined,
  } as unknown as IProviderRuntimeRegistry;
}

describe("Phase 11 — verified capability claims", () => {
  it("no LIVE provider declares ON_ASSET_TEXT (text generation ≠ text fidelity)", () => {
    for (const id of [
      "provider.ideogram",
      "provider.recraft",
      "provider.google",
      "provider.openai",
    ]) {
      expect(providerSupportsOnAssetText(id)).toBe(false);
      expect(classifyImageCapabilityClaim(id, "ON_ASSET_TEXT")).toBe(
        "undeclared",
      );
    }
  });

  it("capability audit matrix distinguishes verified / inferred / undeclared", () => {
    const rows = auditImageProviderCapabilityClaims();
    const onAsset = rows.filter((r) => r.capability === "ON_ASSET_TEXT");
    expect(onAsset.every((r) => r.claim === "undeclared")).toBe(true);
    expect(onAsset.every((r) => r.hasCapability === false)).toBe(true);

    const ideogramRef = rows.find(
      (r) =>
        r.providerId === "provider.ideogram" &&
        r.capability === "REFERENCE_IMAGE",
    );
    expect(ideogramRef?.claim).toBe("verified");

    // OpenAI REFERENCE/TEXT_TO_IMAGE come from OPENAI_IMAGE_SPEC (declarative),
    // not from providerId runtime branches — claim kind is verified.
    const openaiRef = rows.find(
      (r) =>
        r.providerId === "provider.openai" &&
        r.capability === "REFERENCE_IMAGE",
    );
    expect(openaiRef?.claim).toBe("verified");
    expect(openaiRef?.hasCapability).toBe(true);

    const openaiT2i = rows.find(
      (r) =>
        r.providerId === "provider.openai" && r.capability === "TEXT_TO_IMAGE",
    );
    expect(openaiT2i?.claim).toBe("verified");
  });

  it("undeclared hard capability policy is degrade_to_soft", () => {
    expect(UNDECLARED_HARD_CAPABILITY_POLICY).toBe("degrade_to_soft");
    const filtered = filterProvidersByHardCapabilities({
      providerIds: ["provider.openai", "provider.ideogram"],
      hardCapabilities: ["ON_ASSET_TEXT"],
      providerHasCapability: providerHasImageCapability,
    });
    expect(filtered).toEqual(["provider.openai", "provider.ideogram"]);
  });
});

describe("Phase 11 — false-positive / false-negative structural proof", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;

  it("6 — metadata-declared message must NOT yield COMPLIANT (false-positive guard)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: {
          headline: "Hello! We're Sunflower – education for Classes 1-12",
          messageAngle: "introductory brand post",
        },
      },
    });
    expect(result.status).not.toBe("COMPLIANT");
    expect(result.status).toBe("UNVERIFIABLE");
    const textCrit = result.criteria.find(
      (c) => c.criterion === "text_surface_when_required",
    );
    expect(textCrit?.status).toBe("UNVERIFIABLE");
    expect(textCrit?.proofLevel).toBe("declared");
    expect(result.hasDeclaredOnlyEvidence).toBe(true);
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("7 — metadata-backed artifact is not false-NEGATIVE rejected", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: extractStructuralEvidenceFromCandidate({
        previewAssetRef: { vaultAssetId: "vault_1", role: "creative_preview" },
        onImageCopy: {
          headline: "Hello! We're Sunflower",
          messageAngle: "intro",
          provenance: "ai_generated",
        },
      }),
    });
    expect(result.status).not.toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("verified renderedTextProof can yield COMPLIANT text criterion", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: { headline: "Hello! We're Sunflower" },
        renderedTextProof: {
          extractedText: "Hello! We're Sunflower – education for Classes 1-12",
          source: "ocr",
        },
      },
    });
    const textCrit = result.criteria.find(
      (c) => c.criterion === "text_surface_when_required",
    );
    expect(textCrit?.status).toBe("COMPLIANT");
    expect(textCrit?.proofLevel).toBe("verified");
    // Visual subject etc. still unverifiable → overall not COMPLIANT without vision
    expect(result.status).toBe("UNVERIFIABLE");
  });

  it("Sunflower-class failure (no message metadata) is detected as NON_COMPLIANT", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
        structuredFields: {},
      },
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(result.failedRequirements).toEqual(
      expect.arrayContaining([
        "text_surface_when_required",
        "required_element:primary_message_surface",
      ]),
    );
    // Hierarchy / brand signature / visual subject remain unverifiable at pixel level
    expect(
      result.criteria.some(
        (c) =>
          c.criterion === "required_element:visual_subject" &&
          c.status === "UNVERIFIABLE",
      ),
    ).toBe(true);
    expect(
      result.criteria.some(
        (c) =>
          c.criterion === "required_element:brand_signature" &&
          c.status === "UNVERIFIABLE",
      ),
    ).toBe(true);
  });

  it("UNVERIFIABLE is never aggregated as COMPLIANT", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "claimed" },
      },
    });
    expect(result.status).toBe("UNVERIFIABLE");
    expect(result.status === "COMPLIANT").toBe(false);
  });
});

describe("Phase 11 — derivation remains composition-only path", () => {
  it("router uses composition requirements without service/platform/phase args for filter", () => {
    const router = new ImageExecutionRouter(
      mockRegistry([
        "provider.openai",
        "provider.google",
        "provider.ideogram",
      ]),
    );
    const social = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    )!;
    const kv = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("campaign_kv"),
    )!;
    const a = router.resolve({
      prompt: "communication asset",
      capabilityRequirements: social,
    });
    const b = router.resolve({
      prompt: "communication asset",
      capabilityRequirements: kv,
    });
    expect(a.ok && b.ok).toBe(true);
    expect(social.hardCapabilities).toEqual(kv.hardCapabilities);
  });

  it("no layout_fidelity / hierarchy_fidelity / communication_asset invented flags", () => {
    const reqs = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    )!;
    const hard = reqs.hardCapabilities as readonly string[];
    expect(hard).not.toContain("layout_fidelity");
    expect(hard).not.toContain("hierarchy_fidelity");
    expect(hard).not.toContain("communication_asset");
    expect(hard).toContain("ON_ASSET_TEXT");
  });
});
