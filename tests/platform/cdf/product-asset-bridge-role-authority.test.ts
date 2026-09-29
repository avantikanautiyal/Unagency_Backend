/**
 * Product-asset bridge must not invent semanticReferenceRole from vault provenance.
 */

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

jest.mock("../../../src/services/product-asset-service", () => ({
  productAssetService: {
    resolveProviderInputAsset: jest.fn(
      async (input: { assetId: string; organizationId: string }) => ({
        url: `data:image/png;base64,${TINY_PNG}`,
        mimeType: "image/png",
        organizationId: input.organizationId,
        assetId: input.assetId,
      }),
    ),
  },
}));

import { attachProductAssetsToExecutionMetadata } from "../../../src/services/product-asset-input-bridge";
import { resolveMultimodalReferenceRole } from "../../../src/platform/ai/multimodal-context/reference-role";

describe("product-asset-input-bridge — no invented semantic roles", () => {
  it("does not stamp identity_mark from brand_vault_asset alone", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["asset_xyz"] },
    });
    expect(meta.referenceInputType).toBe("brand_vault_asset");
    const image = meta.image as Record<string, unknown>;
    expect(image.semanticReferenceRole).toBeUndefined();
    expect(image.brandAssetRole).toBeUndefined();
    const assets = meta.assets as Array<Record<string, unknown>>;
    expect(assets[0]?.semanticReferenceRole).toBeUndefined();
  });

  it("propagates CTI logo bind via logoAssetId → identity_mark + brandAssetRole=logo", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: {
        assetIds: ["logo_asset_1"],
        logoAssetId: "logo_asset_1",
      },
    });
    const image = meta.image as Record<string, unknown>;
    expect(image.semanticReferenceRole).toBe("identity_mark");
    expect(image.brandAssetRole).toBe("logo");
    expect(image.referenceRoleResolutionSource).toBe(
      "authoritative_brand_logo_relation",
    );
    expect(
      resolveMultimodalReferenceRole({
        brandAssetRole: image.brandAssetRole,
      }),
    ).toBe("identity_mark");
  });

  it("preserves explicit semanticReferenceRole", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: {
        assetIds: ["asset_style"],
        assets: [
          {
            assetId: "asset_style",
            mimeType: "image/png",
            url: `data:image/png;base64,${TINY_PNG}`,
            semanticReferenceRole: "style_reference",
          },
        ],
      },
    });
    const assets = meta.assets as Array<Record<string, unknown>>;
    const styled = assets.find((a) => a.assetId === "asset_style");
    expect(styled?.semanticReferenceRole).toBe("style_reference");
  });
});
