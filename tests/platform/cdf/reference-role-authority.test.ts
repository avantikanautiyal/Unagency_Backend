/**
 * Reference-role authority invariants.
 * Provenance/transport must never invent semantic roles.
 */

import {
  resolveMultimodalReferenceRole,
  planImageReferenceAdaptation,
} from "../../../src/platform/ai/multimodal-context/reference-role";
import { descriptorsFromExecutionMetadata } from "../../../src/platform/cdf/generation-context/resolve-multimodal-context";
import { selectMultimodalContext } from "../../../src/platform/ai/multimodal-context";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";
import {
  applyReferenceRolePromptGuidance,
  extractReferenceImages,
} from "../../../src/platform/providers/image/common/vendor-image-protocol";
import { IdeogramImageProtocol } from "../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { RecraftImageProtocol } from "../../../src/platform/providers/image/recraft/recraft-image-protocol";
import {
  IDEOGRAM_IMAGE_SPEC,
  RECRAFT_IMAGE_SPEC,
} from "../../../src/platform/providers/image/configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function requestWithImage(opts: {
  role?: string;
  brandAssetRole?: string;
  referenceInputType?: string;
  logoAssetId?: string;
  assetId?: string;
}): ProviderExecutionRequest {
  const assetId = opts.assetId ?? "asset_1";
  return {
    requestId: "req_role_auth",
    providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
    modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
    capabilityId: "image.generate" as never,
    payload: {
      prompt: "Finished creative",
      text: "Finished creative",
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        assetId,
        ...(opts.role ? { semanticReferenceRole: opts.role } : {}),
        ...(opts.brandAssetRole ? { brandAssetRole: opts.brandAssetRole } : {}),
        ...(opts.referenceInputType
          ? { referenceInputType: opts.referenceInputType }
          : {}),
      },
    },
    metadata: {
      ...(opts.referenceInputType
        ? { referenceInputType: opts.referenceInputType }
        : {}),
      ...(opts.logoAssetId ? { logoAssetId: opts.logoAssetId } : {}),
    },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
}

function minimalGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction: "Create the deliverable.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "Brand",
      facts: [],
      negatives: [],
      factKeys: [],
    },
    productGrounding: { service: "creative" },
    selectedSemanticChoices: [],
    cdfContext: {
      contextId: "ctx",
      contextHash: "h",
      sessionId: "cdf",
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
        dependencyPhaseIds: [],
        allowNonVisualReady: false,
        selectionMode: "required_one",
        approvalMode: "required",
        refinementEnabled: true,
        refinementScopes: [],
        entryMessage: "Here is your creative:",
        description: "Here is your creative:",
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
      instructions: ["Generate"],
      executionStrategy: "canonical",
    },
    generationContextHash: "h",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("reference-role authority — explicit roles preserved", () => {
  it.each([
    "identity_mark",
    "style_reference",
    "product_reference",
  ] as const)("explicit %s remains %s", (role) => {
    expect(
      resolveMultimodalReferenceRole({ semanticReferenceRole: role }),
    ).toBe(role);
    const refs = extractReferenceImages({
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: role,
        referenceInputType: "brand_vault_asset",
      },
    });
    expect(refs[0]?.semanticReferenceRole).toBe(role);
  });
});

describe("reference-role authority — CTI / brandAssetRole", () => {
  it("CTI logo → identity_mark", () => {
    expect(
      resolveMultimodalReferenceRole({ brandAssetRole: "logo" }),
    ).toBe("identity_mark");
    expect(
      resolveMultimodalReferenceRole({ brandAssetRole: "brand_mark" }),
    ).toBe("identity_mark");
  });

  it("CTI reference → generic_reference", () => {
    expect(
      resolveMultimodalReferenceRole({ brandAssetRole: "reference" }),
    ).toBe("generic_reference");
  });
});

describe("reference-role authority — no provenance inference", () => {
  it("brand_vault_asset alone produces NO semantic role", () => {
    expect(resolveMultimodalReferenceRole({})).toBeUndefined();
  });

  it("product asset / referenceInputType alone → no role on descriptors", () => {
    const descriptors = descriptorsFromExecutionMetadata({
      referenceInputType: "brand_vault_asset",
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        referenceInputType: "brand_vault_asset",
      },
    });
    expect(descriptors[0]?.semanticReferenceRole).toBeUndefined();
  });

  it("absence of role does not become identity_mark in adaptation", () => {
    const refs = extractReferenceImages({
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        referenceInputType: "brand_vault_asset",
      },
    });
    expect(refs[0]?.semanticReferenceRole).toBeUndefined();
    const { adaptations, prompt } = applyReferenceRolePromptGuidance({
      basePrompt: "Make a creative",
      references: refs,
    });
    expect(adaptations).toHaveLength(0);
    expect(prompt).not.toMatch(/REFERENCE ROLE = identity_mark/);
    expect(prompt).not.toMatch(/REFERENCE ROLE = generic_reference/);
  });
});

describe("reference-role authority — explicit wins over provenance", () => {
  it("conflicting provenance cannot override explicit semantic role", () => {
    expect(
      resolveMultimodalReferenceRole({
        semanticReferenceRole: "product_reference",
        brandAssetRole: "logo",
      }),
    ).toBe("product_reference");
    const refs = extractReferenceImages({
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: "style_reference",
        referenceInputType: "brand_vault_asset",
        brandAssetRole: "logo",
      },
    });
    expect(refs[0]?.semanticReferenceRole).toBe("style_reference");
  });
});

describe("reference-role authority — CMR + provider adaptation", () => {
  it("persisted product_reference propagates through CMR", () => {
    const descriptors = descriptorsFromExecutionMetadata({
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
        semanticReferenceRole: "product_reference",
        assetId: "prod_1",
      },
    });
    const mm = selectMultimodalContext({
      descriptors,
      organizationId: "org_1",
    });
    expect(mm.items[0]?.semanticReferenceRole).toBe("product_reference");
    const cmr = compileCanonicalModelRequestFromGeneration(
      minimalGeneration({ multimodalContext: mm }),
    );
    const mmPart = cmr.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "multimodal_context");
    expect(mmPart && mmPart.type === "structured").toBe(true);
    if (!mmPart || mmPart.type !== "structured") return;
    const items = (mmPart.data as { items: Array<{ semanticReferenceRole?: string }> })
      .items;
    expect(items[0]?.semanticReferenceRole).toBe("product_reference");
  });

  it("provider adaptation preserves canonical role (≠ style_reference rewrite)", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithImage({ role: "identity_mark" }),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).not.toBe(
      "style_reference",
    );
    expect(String(plan.request.form?.fields.prompt)).toMatch(
      /REFERENCE ROLE = identity_mark/,
    );

    const recraft = new RecraftImageProtocol().buildGenerateRequest({
      spec: RECRAFT_IMAGE_SPEC,
      request: {
        ...requestWithImage({ role: "identity_mark" }),
        providerId: RECRAFT_IMAGE_SPEC.canonicalProviderId as never,
        modelId: RECRAFT_IMAGE_SPEC.inventoryModelId,
      },
      wireModelId: RECRAFT_IMAGE_SPEC.wireModelId,
    });
    expect(recraft.referenceAdaptation?.[0]?.canonicalRole).toBe(
      "identity_mark",
    );
    expect(planImageReferenceAdaptation("identity_mark").useStyleReferenceChannel).toBe(
      false,
    );
  });

  it("vault provenance alone does not create identity_mark adaptation", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithImage({ referenceInputType: "brand_vault_asset" }),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.referenceAdaptation ?? []).toHaveLength(0);
    expect(String(plan.request.form?.fields.prompt)).not.toMatch(
      /REFERENCE ROLE = identity_mark/,
    );
  });
});
