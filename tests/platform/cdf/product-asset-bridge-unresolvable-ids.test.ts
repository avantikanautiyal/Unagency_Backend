/**
 * One unusable reference id (malformed / deleted / other tenant) must not fail
 * the whole create — project references are replayed on every later step.
 */

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

jest.mock("../../../src/services/product-asset-service", () => {
  const { ApiError } = jest.requireActual("../../../src/utils/apiError");
  return {
    productAssetService: {
      resolveProviderInputAsset: jest.fn(
        async (input: { assetId: string; organizationId: string }) => {
          if (input.assetId === "cdfart_not_a_vault_id") {
            throw new ApiError("Invalid asset id", 400);
          }
          if (input.assetId === "6acf00000000000000000000") {
            throw new ApiError("Asset not found", 404);
          }
          if (input.assetId === "6acf99999999999999999999") {
            throw new Error("storage outage");
          }
          return {
            url: `data:image/png;base64,${TINY_PNG}`,
            mimeType: "image/png",
            organizationId: input.organizationId,
            assetId: input.assetId,
          };
        },
      ),
    },
  };
});

import { attachProductAssetsToExecutionMetadata } from "../../../src/services/product-asset-input-bridge";

describe("product-asset-input-bridge — unresolvable reference ids", () => {
  it("skips malformed and missing ids and keeps the usable ones", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: {
        assetIds: ["6acf11111111111111111111", "cdfart_not_a_vault_id", "6acf00000000000000000000"],
      },
    });
    expect(meta.assetIds).toEqual(["6acf11111111111111111111"]);
    expect(meta.productAssetIdsSkipped).toEqual([
      "cdfart_not_a_vault_id",
      "6acf00000000000000000000",
    ]);
    expect((meta.assets as unknown[]).length).toBe(1);
  });

  it("generates without references when none resolve", async () => {
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["cdfart_not_a_vault_id"] },
    });
    expect(meta.assetIds).toEqual([]);
    expect(meta.image).toBeUndefined();
  });

  it("still fails on infrastructure errors", async () => {
    await expect(
      attachProductAssetsToExecutionMetadata({
        userId: "u1",
        organizationId: "org_1",
        metadata: { assetIds: ["6acf99999999999999999999"] },
      }),
    ).rejects.toThrow("storage outage");
  });
});
