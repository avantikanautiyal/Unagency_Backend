/**
 * Pre-live certification gate — authority + fanout pins (no live providers).
 */

import {
  buildLiveCertFanoutPlan,
  LIVE_CERT_REQUIRED_TARGETS,
  resolveBrandMarkFromExecutionAuthority,
  runLiveCertificationPreflight,
} from "../../../../src/platform/cdf/deterministic-composition";
import { buildGenerationFanoutLeafMetadata as buildLeafMeta } from "../../../../src/platform/generation/generation-fanout";
import {
  buildInstagramFeedPostCertFixture,
  CERT_CANVAS,
  CERT_PRIMARY_MESSAGE,
} from "../../../../src/platform/certification/fixtures/social-media-instagram-feed-post";
import { expectedTextsFromExecutionMetadata } from "../../../../src/platform/cdf/generation-validation/structural-composition-validation";

function sharedLeafAuthorityMeta(overrides: Record<string, unknown> = {}) {
  const fixture = buildInstagramFeedPostCertFixture();
  const logoB64 = fixture.logoBytes.toString("base64");
  return {
    cdfDeliverableKind: "social_creative",
    cdfSelectedArtifactId: "cdfart_routes_shared_cert",
    cdfSelectedArtifactVersion: 1,
    cdfSelectedArtifactKey: "social-media.routes",
    brandLogoAssetId: "brand_logo_asset_1",
    logoAssetId: "brand_logo_asset_1",
    brandName: "Sunflower",
    assets: [
      {
        assetId: "brand_logo_asset_1",
        mimeType: "image/png",
        brandAssetRole: "logo",
        semanticReferenceRole: "identity_mark",
        url: `data:image/png;base64,${logoB64}`,
      },
    ],
    canonicalModelRequest: {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "structured",
              name: "deliverable_composition",
              data: {
                requiredRenderedCommunication: {
                  surfaces: [
                    {
                      element: "primary_message_surface",
                      resolutionStatus: "resolved",
                      text: CERT_PRIMARY_MESSAGE,
                      required: true,
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe("Authority — brand mark from existing assets (no redundant stamp)", () => {
  it("resolves brand bytes from assets[] data URL + logoAssetId", () => {
    const meta = sharedLeafAuthorityMeta();
    // Explicitly omit base64 stamp
    delete (meta as { cdfCompositionBrandMarkBase64?: string })
      .cdfCompositionBrandMarkBase64;
    const brand = resolveBrandMarkFromExecutionAuthority(meta);
    expect(brand).not.toBeNull();
    expect(brand!.provenance).toBe("execution_metadata_assets_data_url");
    expect(brand!.bytes.length).toBeGreaterThan(8);
    expect(brand!.assetId).toBe("brand_logo_asset_1");
  });

  it("primary message comes from CMR RRC, not provider prose", () => {
    const meta = sharedLeafAuthorityMeta();
    const texts = expectedTextsFromExecutionMetadata(meta);
    expect(texts[0]).toBe(CERT_PRIMARY_MESSAGE);
  });
});

describe("Fanout pins — three independent leaves", () => {
  it("plans ChatGPT + two Gemini with empty failover chains", () => {
    const plan = buildLiveCertFanoutPlan("fanout_preflight_cert");
    expect(plan.targets).toHaveLength(3);
    expect(plan.disableCrossProviderFailover).toBe(true);

    for (const required of LIVE_CERT_REQUIRED_TARGETS) {
      expect(
        plan.targets.some(
          (t) =>
            t.providerId === required.providerId &&
            t.modelId === required.modelId,
        ),
      ).toBe(true);
    }

    for (const target of plan.targets) {
      const leaf = buildLeafMeta({ plan, target });
      expect(leaf.generationFanoutLeaf).toBe(true);
      expect(leaf.imageFailoverChain).toEqual([]);
      expect(leaf.generationFanoutGroupId).toBe("fanout_preflight_cert");
    }
  });
});

describe("Pre-live certification preflight", () => {
  it("READY_FOR_LIVE_CERTIFICATION when shared authority is present on all leaves", () => {
    const base = sharedLeafAuthorityMeta();
    const plan = buildLiveCertFanoutPlan("fanout_preflight_ready");
    const samples = plan.targets.map((t) => ({
      ...base,
      ...buildLeafMeta({ plan, target: t }),
    }));

    const report = runLiveCertificationPreflight({
      fanoutGroupId: "fanout_preflight_ready",
      leafMetadataSamples: samples,
      canvas: CERT_CANVAS,
    });

    expect(report.status).toBe("READY_FOR_LIVE_CERTIFICATION");
    expect(report.checks.every((c) => c.pass)).toBe(true);
    expect(report.fanout.leaves).toHaveLength(3);
    expect(report.sharedAuthority.contractKind).toBe("social_creative");
    expect(report.sharedAuthority.canvas.widthPx).toBe(1080);
  });

  it("BLOCKED when brand bytes cannot be recovered", () => {
    const base = sharedLeafAuthorityMeta({
      assets: [],
      brandLogoAssetId: undefined,
      logoAssetId: undefined,
    });
    const plan = buildLiveCertFanoutPlan("fanout_preflight_blocked");
    const samples = plan.targets.map((t) => ({
      ...base,
      ...buildLeafMeta({ plan, target: t }),
    }));
    const report = runLiveCertificationPreflight({
      fanoutGroupId: "fanout_preflight_blocked",
      leafMetadataSamples: samples,
      canvas: CERT_CANVAS,
    });
    expect(report.status).toBe("BLOCKED");
    expect(
      report.checks.find((c) => c.id === "deterministic_brand_bytes")?.pass,
    ).toBe(false);
  });
});
