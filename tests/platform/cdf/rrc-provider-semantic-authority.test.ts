/**
 * RRC semantic authority — offline forensics (no live provider calls).
 *
 * Proves:
 * - ONE authoritative generationContextHash projection
 * - Selected route X@V fingerprint from ArtifactVersion surfaces
 * - Exact RRC survives flatten + OpenAI/Google/Ideogram adapter transforms
 * - Reference-role append cannot demote / rewrite RRC
 * - TEXT_TO_IMAGE ≠ declared ON_ASSET_TEXT fidelity
 */

import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import type { CanonicalModelRequest } from "../../../src/platform/ai/canonical-model-request/types";
import {
  applyProviderReferenceAdaptations,
  applyReferenceRolePromptGuidance,
} from "../../../src/platform/providers/image/common/vendor-image-protocol";
import {
  classifyImageCapabilityClaim,
  providerDeclaresVerifiedOnAssetTextFidelity,
  textPromptAcceptanceIsNotRenderedTextFidelity,
} from "../../../src/platform/providers/image/configs/image-provider-capabilities";
import {
  parseSelectedDirectionIdentity,
  resolveAuthoritativeGenerationContextHash,
  resolveSelectedRouteArtifactPin,
  selectedRoutePinIsResolved,
} from "../../../src/platform/cdf/generation-context/canonical-evidence-projection";
import { CDF_CANONICAL_CONTEXT_META } from "../../../src/platform/cdf/generation-context/flag";

const EXACT_RRC =
  "Sunflower is your trusted education partner, helping students from Classes 1-12 grow, learn, and shine with confidence";

const AUTHORITATIVE_HASH = "cf77277f";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixtureCmr(): CanonicalModelRequest {
  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "I want to create an instagram post about my brand.",
            semanticRole: "current_user_instruction",
          },
          {
            type: "structured",
            name: "deliverable_composition",
            semanticRole: "deliverable_composition",
            data: {
              deliverableKind: "social_creative",
              requiredRenderedCommunication: {
                active: true,
                placement: "on_asset",
                required: true,
                allRequiredResolved: true,
                unresolvedElements: [],
                note: "REQUIRED_RENDERED_COMMUNICATION must appear as legible on-asset text with an authoritative non-empty value. Distinct from CREATIVE_DIRECTION, VISUAL_SUBJECT, BRAND_SIGNATURE, and decorative typography.",
                surfaces: [
                  {
                    element: "primary_message_surface",
                    semanticClass: "required_rendered_communication",
                    required: true,
                    text: EXACT_RRC,
                    provenance: "selected_semantic_direction",
                    resolutionStatus: "resolved",
                  },
                ],
              },
              semanticRoleSeparation:
                "Semantic roles are not interchangeable: brand_signature and identity_mark do not satisfy primary_message_surface.",
              lowerAuthorityQualification:
                "Selected creative direction does not cancel required on-asset communication.",
            },
          },
          {
            type: "text",
            text: "REQUIRED DELIVERABLE COMPOSITION outranks selected creative direction preferences when they conflict. Required on-asset communication must appear as legible rendered text.",
            semanticRole: "composition_authority",
          },
          {
            type: "structured",
            name: "selected_semantic_directions",
            semanticRole: "selected_semantic_direction",
            data: [
              {
                phaseId: "routes",
                artifactId: "cdfart_mu1lz5y8_1_social-media-routes",
                version: 1,
                artifactKey: "social-media.routes",
                selectedRouteIndex: 0,
                optionNumber: 1,
                choiceArrayKey: "routes",
                semanticFieldNames: ["primaryMessage", "name"],
                choice: {
                  routeId: "route_01_bright_beginnings",
                  name: "Bright Beginnings",
                  primaryMessage: EXACT_RRC,
                },
              },
            ],
          },
          {
            type: "structured",
            name: "production_specification",
            semanticRole: "production_specification",
            data: {
              note: "Technical production constraints only — cannot cancel required rendered communication.",
            },
          },
        ],
      },
    ],
    metadata: {
      generationContextHash: AUTHORITATIVE_HASH,
      cdfSessionId: "cdf_mu1lxl3w_1wc25tt7",
      cdfPhaseId: "output",
      serviceId: "social-media",
      deliverableCompositionPresent: true,
    },
  } as CanonicalModelRequest;
}

function assertRrcAuthorityIntact(prompt: string, label: string) {
  expect(prompt.includes(EXACT_RRC)).toBe(true);
  expect(prompt).toMatch(/REQUIRED RENDERED COMMUNICATION/i);
  expect(prompt).toMatch(/must appear/i);
  // Must not reclassify RRC as caption / optional / inspiration
  expect(prompt.toLowerCase()).not.toMatch(
    /required rendered communication[\s\S]{0,80}(optional caption|alt text|post caption only)/i,
  );
  if (!prompt.includes(EXACT_RRC)) {
    throw new Error(`RRC authority broken at ${label}`);
  }
}

describe("canonical evidence projection — generationContextHash", () => {
  it("reads ONE authoritative stamp (cdfCanonicalContextHash)", () => {
    const hash = resolveAuthoritativeGenerationContextHash({
      metadata: {
        [CDF_CANONICAL_CONTEXT_META.hash]: AUTHORITATIVE_HASH,
      },
    });
    expect(hash).toBe(AUTHORITATIVE_HASH);
  });

  it("falls back to CMR metadata.generationContextHash (same authority copy)", () => {
    const hash = resolveAuthoritativeGenerationContextHash({
      metadata: {},
      cmr: fixtureCmr(),
    });
    expect(hash).toBe(AUTHORITATIVE_HASH);
  });

  it("does not invent a synthetic hash when authority is absent", () => {
    expect(
      resolveAuthoritativeGenerationContextHash({ metadata: {}, cmr: null }),
    ).toBeNull();
  });

  it("prefers stamped metadata over CMR when both present", () => {
    expect(
      resolveAuthoritativeGenerationContextHash({
        metadata: { [CDF_CANONICAL_CONTEXT_META.hash]: "aabbccdd" },
        cmr: fixtureCmr(),
      }),
    ).toBe("aabbccdd");
  });
});

describe("canonical evidence projection — selected route X@V", () => {
  it("parses cdfSelectedDirectionIdentity string pin", () => {
    const parsed = parseSelectedDirectionIdentity(
      "cdfart_mu1lz5y8_1_social-media-routes@1#routes[0]",
    );
    expect(parsed).toMatchObject({
      artifactId: "cdfart_mu1lz5y8_1_social-media-routes",
      version: 1,
      choiceArrayKey: "routes",
      selectedRouteIndex: 0,
    });
  });

  it("resolves structured metadata stamps first", () => {
    const pin = resolveSelectedRouteArtifactPin({
      metadata: {
        [CDF_CANONICAL_CONTEXT_META.selectedArtifactId]:
          "cdfart_mu1lz5y8_1_social-media-routes",
        [CDF_CANONICAL_CONTEXT_META.selectedArtifactVersion]: 1,
        [CDF_CANONICAL_CONTEXT_META.selectedArtifactKey]: "social-media.routes",
        [CDF_CANONICAL_CONTEXT_META.selectedDirectionIdentity]:
          "cdfart_mu1lz5y8_1_social-media-routes@1#routes[0]",
      },
    });
    expect(selectedRoutePinIsResolved(pin)).toBe(true);
    expect(pin.source).toBe("metadata_structured");
    expect(pin.artifactId).toBe("cdfart_mu1lz5y8_1_social-media-routes");
    expect(pin.version).toBe(1);
    expect(pin.artifactKey).toBe("social-media.routes");
  });

  it("does not leave nulls when only identity string is stamped (harness bug class)", () => {
    const pin = resolveSelectedRouteArtifactPin({
      metadata: {
        [CDF_CANONICAL_CONTEXT_META.selectedDirectionIdentity]:
          "cdfart_mu1lz5y8_1_social-media-routes@1#routes[0]",
      },
    });
    expect(pin.source).toBe("metadata_identity");
    expect(pin.artifactId).toBe("cdfart_mu1lz5y8_1_social-media-routes");
    expect(pin.version).toBe(1);
    expect(pin.artifactId).not.toBeNull();
  });

  it("resolves from CMR selected_semantic_directions ArtifactVersion fields", () => {
    const pin = resolveSelectedRouteArtifactPin({
      metadata: {},
      cmr: fixtureCmr(),
    });
    expect(pin.source).toBe("cmr_selected_semantic_directions");
    expect(pin).toMatchObject({
      artifactId: "cdfart_mu1lz5y8_1_social-media-routes",
      version: 1,
      artifactKey: "social-media.routes",
      selectedRouteIndex: 0,
    });
  });
});

describe("RRC authority — flatten + multi-provider adapter (offline)", () => {
  const cmr = fixtureCmr();
  const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);

  it("flatten preserves exact RRC as required on-asset communication", () => {
    assertRrcAuthorityIntact(flat, "flatten");
    expect(flat).toMatch(/DELIVERABLE COMPOSITION/i);
    // Ordering: deliverable / RRC before production spec authority demotion risk
    const rrcAt = flat.indexOf("REQUIRED RENDERED COMMUNICATION");
    const prodAt = flat.toLowerCase().indexOf("production");
    expect(rrcAt).toBeGreaterThan(-1);
    if (prodAt > -1) expect(rrcAt).toBeLessThan(prodAt);
  });

  const refs = [
    {
      mimeType: "image/png",
      base64: TINY_PNG,
      semanticReferenceRole: "identity_mark" as const,
      assetId: "6a98cb217bc20263f64311aa",
    },
  ];

  it.each([
    ["ideogram", "ideogram"],
    ["google", "google_gemini_image"],
    ["recraft", "recraft"],
  ] as const)(
    "%s adapter retains RRC authority after reference-role append",
    (_label, vendor) => {
      const { prompt, adaptations } = applyProviderReferenceAdaptations({
        basePrompt: flat,
        references: refs,
        vendor,
      });
      assertRrcAuthorityIntact(prompt, `${vendor} wire`);
      expect(adaptations[0]?.canonicalRole).toBe("identity_mark");
      expect(prompt).toContain("REFERENCE ROLE = identity_mark");
      // Append must remain subordinate — must not rewrite RRC text
      expect(prompt.indexOf(EXACT_RRC)).toBe(flat.indexOf(EXACT_RRC));
      expect(prompt).toContain(
        "deliverable composition / selected direction",
      );
    },
  );

  it("OpenAI-style reference guidance append retains RRC (edits path)", () => {
    const { prompt } = applyReferenceRolePromptGuidance({
      basePrompt: flat,
      references: refs,
    });
    assertRrcAuthorityIntact(prompt, "openai edits guidance");
    expect(prompt).toContain("REFERENCE ROLE = identity_mark");
  });

  it("OpenAI generate path uses base prompt without demoting RRC", () => {
    // generate path assigns body.prompt = basePrompt (no rewrite)
    assertRrcAuthorityIntact(flat, "openai generate base");
  });

  it("production-spec / reference guidance cannot remove exact RRC", () => {
    const withNoise = `${flat}\n\nPRODUCTION HINT: minimize decorative typography.\nREFERENCE ROLE = identity_mark: subordinate brand signature only.`;
    expect(withNoise).toContain(EXACT_RRC);
    const { prompt } = applyProviderReferenceAdaptations({
      basePrompt: withNoise,
      references: refs,
      vendor: "ideogram",
    });
    // Already contains REFERENCE ROLE — must not duplicate-rewrite composition
    expect(prompt).toContain(EXACT_RRC);
    expect(
      (prompt.match(/REFERENCE ROLE = identity_mark/g) || []).length,
    ).toBe(1);
  });
});

describe("capability vocabulary — prompt acceptance ≠ rendered-text fidelity", () => {
  it("documents the distinction", () => {
    expect(textPromptAcceptanceIsNotRenderedTextFidelity()).toBe(true);
  });

  it.each([
    "provider.ideogram",
    "provider.google",
    "provider.openai",
  ])("%s does not declare ON_ASSET_TEXT from TEXT_TO_IMAGE", (providerId) => {
    expect(classifyImageCapabilityClaim(providerId, "ON_ASSET_TEXT")).toBe(
      "undeclared",
    );
    expect(providerDeclaresVerifiedOnAssetTextFidelity(providerId)).toBe(false);
  });
});
