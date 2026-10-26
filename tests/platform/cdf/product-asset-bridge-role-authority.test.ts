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
  it("treats an attached photo as the client's product, never as a logo", async () => {
    // Live defect: a ring photo went to the model role-less and it drew a necklace.
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["asset_xyz"] },
    });
    expect(meta.referenceInputType).toBe("brand_vault_asset");
    const image = meta.image as Record<string, unknown>;
    expect(image.semanticReferenceRole).toBe("product_reference");
    expect(image.brandAssetRole).toBeUndefined();
    const assets = meta.assets as Array<Record<string, unknown>>;
    expect(assets[0]?.semanticReferenceRole).toBe("product_reference");
  });

  it("keeps vault logos as the logo and brand documents role-less", async () => {
    const { productAssetService } = jest.requireMock(
      "../../../src/services/product-asset-service",
    ) as { productAssetService: { resolveProviderInputAsset: jest.Mock } };
    productAssetService.resolveProviderInputAsset
      .mockImplementationOnce(async (input: { assetId: string; organizationId: string }) => ({
        url: `data:image/png;base64,${TINY_PNG}`,
        mimeType: "image/png",
        organizationId: input.organizationId,
        assetId: input.assetId,
        folder: "logos",
      }))
      .mockImplementationOnce(async (input: { assetId: string; organizationId: string }) => ({
        url: `data:image/jpeg;base64,${TINY_PNG}AA`,
        mimeType: "image/jpeg",
        organizationId: input.organizationId,
        assetId: input.assetId,
        folder: "marketing",
        tags: ["brand-document"],
      }));
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["vault_logo", "brand_doc"] },
    });
    const assets = meta.assets as Array<Record<string, unknown>>;
    expect(assets.find((a) => a.assetId === "vault_logo")?.semanticReferenceRole).toBe(
      "identity_mark",
    );
    expect(
      assets.find((a) => a.assetId === "brand_doc")?.semanticReferenceRole,
    ).toBeUndefined();
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
