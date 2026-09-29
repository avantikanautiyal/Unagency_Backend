/**
 * Phase 10 — capability-aware routing + structural acceptance + adapter authority.
 */

import { promptGuidanceForReferenceRole } from "../../../src/platform/ai/multimodal-context/reference-role";
import type { MultimodalReferenceRole } from "../../../src/platform/ai/multimodal-context/reference-role";
import {
  deriveExecutionCapabilityRequirements,
  filterProvidersByHardCapabilities,
  softRankProviderPreferences,
} from "../../../src/platform/cdf/generation-context/execution-capability-requirements";
import {
  resolveDeliverableCompositionContract,
  DELIVERABLE_KIND_PROFILES,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  evaluateStructuralCompositionCompliance,
  extractStructuralEvidenceFromCandidate,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { ImageExecutionRouter } from "../../../src/platform/providers/image/routing/image-execution-router";
import type { IProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import type { ImageProviderCapabilityFlag } from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import { IdeogramImageProtocol } from "../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { IDEOGRAM_IMAGE_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";

function mockRegistry(providerIds: string[]): IProviderRuntimeRegistry {
  return {
    listAvailableProviderIds: () => providerIds,
    resolveAvailable: (id: string) =>
      providerIds.includes(String(id))
        ? { capabilities: ["image.generate"] }
        : undefined,
  } as unknown as IProviderRuntimeRegistry;
}

const AUTHORITY_CLAIM_RE =
  /primary creative authority|outranks|overrides?\s+(the\s+)?(deliverable|composition|user instruction)/i;

describe("Phase 10 — provider adapter authority", () => {
  it("A — reference guidance never redefines deliverable/creative authority hierarchy", () => {
    const roles: MultimodalReferenceRole[] = [
      "identity_mark",
      "identity_reference",
      "style_reference",
      "composition_reference",
      "product_reference",
      "subject_reference",
      "texture_material_reference",
      "generic_reference",
    ];
    for (const role of roles) {
      const g = promptGuidanceForReferenceRole(role);
      expect(g).toMatch(/REFERENCE ROLE =/);
      expect(g).not.toMatch(AUTHORITY_CLAIM_RE);
      expect(g).not.toMatch(/SELECTED SEMANTIC DIRECTION remains the primary/i);
    }
  });

  it("A2 — Ideogram identity_mark append does not claim selected direction authority", () => {
    const TINY =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const request: ProviderExecutionRequest = {
      requestId: "req",
      providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
      modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
      capabilityId: "image.generate" as never,
      payload: {
        prompt: "===== DELIVERABLE COMPOSITION =====\nText policy: required=true",
        text: "===== DELIVERABLE COMPOSITION =====\nText policy: required=true",
        image: {
          mimeType: "image/png",
          url: `data:image/png;base64,${TINY}`,
          semanticReferenceRole: "identity_mark",
        },
      },
      metadata: {},
      context: {} as never,
      timeoutPolicy: {} as never,
      retryPolicy: {} as never,
    };
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request,
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    const prompt = String(plan.request.form?.fields.prompt ?? "");
    expect(prompt).toContain("DELIVERABLE COMPOSITION");
    expect(prompt).toMatch(/REFERENCE ROLE = identity_mark/);
    expect(prompt).not.toMatch(/SELECTED SEMANTIC DIRECTION remains the primary/i);
  });
});

describe("Phase 10 — composition-derived capability requirements", () => {
  it("B/J — textPolicy.required derives ON_ASSET_TEXT hard capability for social_creative", () => {
    const contract = resolveDeliverableCompositionContract("social_creative");
    const reqs = deriveExecutionCapabilityRequirements(contract);
    expect(reqs?.hardCapabilities).toContain("ON_ASSET_TEXT");
    expect(reqs?.hardCapabilities).toContain("TEXT_TO_IMAGE");
    expect(reqs?.softPreferences.preferOnAssetTextCapable).toBe(true);
    expect(reqs?.derivedFrom.textPolicyRequired).toBe(true);
  });

  it("E — campaign_kv uses identical derivation machinery", () => {
    const social = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    );
    const kv = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("campaign_kv"),
    );
    expect(social?.hardCapabilities).toEqual(kv?.hardCapabilities);
    expect(social?.softPreferences).toEqual(kv?.softPreferences);
    expect(social?.derivedFrom.deliverableKind).toBe("social_creative");
    expect(kv?.derivedFrom.deliverableKind).toBe("campaign_kv");
  });

  it("B — logo-like composition without required text does not force ON_ASSET_TEXT", () => {
    const logo = DELIVERABLE_KIND_PROFILES.logo?.composition;
    const reqs = deriveExecutionCapabilityRequirements(logo);
    expect(reqs?.hardCapabilities.includes("ON_ASSET_TEXT") ?? false).toBe(
      false,
    );
  });

  it("C — hard filter keeps providers when capability undeclared across set", () => {
    const filtered = filterProvidersByHardCapabilities({
      providerIds: ["provider.openai", "provider.ideogram", "provider.google"],
      hardCapabilities: ["ON_ASSET_TEXT"],
      providerHasCapability: () => false,
    });
    expect(filtered).toEqual([
      "provider.openai",
      "provider.ideogram",
      "provider.google",
    ]);
  });

  it("C — hard filter narrows when some providers declare capability", () => {
    const filtered = filterProvidersByHardCapabilities({
      providerIds: ["provider.openai", "provider.ideogram", "provider.google"],
      hardCapabilities: ["ON_ASSET_TEXT"],
      providerHasCapability: (id, cap) =>
        cap === "ON_ASSET_TEXT" && id === "provider.ideogram",
    });
    expect(filtered).toEqual(["provider.ideogram"]);
  });

  it("D — soft ranking preserves relative order when scores tie", () => {
    const ranked = softRankProviderPreferences({
      preferences: [
        { providerId: "provider.openai" },
        { providerId: "provider.google" },
        { providerId: "provider.ideogram" },
      ],
      soft: {
        preferOnAssetTextCapable: true,
        preferReferenceCapable: false,
      },
      providerHasCapability: () => false,
    });
    expect(ranked.map((p) => p.providerId)).toEqual([
      "provider.openai",
      "provider.google",
      "provider.ideogram",
    ]);
  });

  it("D — soft ranking boosts ON_ASSET_TEXT capable providers", () => {
    const ranked = softRankProviderPreferences({
      preferences: [
        { providerId: "provider.openai" },
        { providerId: "provider.ideogram" },
      ],
      soft: {
        preferOnAssetTextCapable: true,
        preferReferenceCapable: false,
      },
      providerHasCapability: (id, cap) =>
        cap === "ON_ASSET_TEXT" && id === "provider.ideogram",
    });
    expect(ranked[0]?.providerId).toBe("provider.ideogram");
  });
});

describe("Phase 10 — routing uses composition requirements without service/platform branches", () => {
  const router = new ImageExecutionRouter(
    mockRegistry([
      "provider.openai",
      "provider.google",
      "provider.ideogram",
    ]),
  );

  it("F/G/H — resolve does not require service/phase/platform for capability filter", () => {
    const contract = resolveDeliverableCompositionContract("social_creative");
    const reqs = deriveExecutionCapabilityRequirements(contract)!;
    const routed = router.resolve({
      prompt: "Create a finished communication asset",
      capabilityRequirements: reqs,
    });
    expect(routed.ok).toBe(true);
    if (routed.ok) {
      expect(routed.value.capabilityRequirements?.hardCapabilities).toContain(
        "ON_ASSET_TEXT",
      );
      expect(routed.value.providerId).toBeTruthy();
    }
  });

  it("I — no provider-specific semantic branch in derivation", () => {
    const a = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    );
    const b = deriveExecutionCapabilityRequirements(
      resolveDeliverableCompositionContract("campaign_kv"),
    );
    // Same hard set independent of which provider will run
    expect(a?.hardCapabilities).toEqual(b?.hardCapabilities);
  });
});

describe("Phase 10 — structural acceptance", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;

  it("K — missing required text surface is NON_COMPLIANT and blocks completion", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
      },
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(result.failedRequirements.length).toBeGreaterThan(0);
  });

  it("L — UNVERIFIABLE is not COMPLIANT", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: {
          headline: "Hello! We're Sunflower – education for Classes 1-12",
        },
      },
    });
    // Message criteria pass; visual elements remain unverifiable without OCR
    expect(result.status).not.toBe("COMPLIANT");
    expect(["UNVERIFIABLE", "NON_COMPLIANT"]).toContain(result.status);
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("M — structural status is independent of aesthetic/model quality scores", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { hasPreviewAsset: true, onImageCopy: null },
    });
    expect(result).not.toHaveProperty("qualityScore");
    expect(result).not.toHaveProperty("aesthetic");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("K2 — campaign_kv same machinery", () => {
    const kv = resolveDeliverableCompositionContract("campaign_kv")!;
    const result = evaluateStructuralCompositionCompliance({
      contract: kv,
      evidence: extractStructuralEvidenceFromCandidate({
        previewAssetRef: { vaultAssetId: "v1", role: "creative_preview" },
      }),
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("null contract does not block", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract: null,
      evidence: {},
    });
    expect(result.status).toBe("COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(false);
  });
});
