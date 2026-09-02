import {
  ensureBrandLogoInExecutionMetadata,
  shouldProactivelyAttachBrandLogo,
} from "../../../src/services/ensure-brand-logo-execution-metadata";

describe("ensure-brand-logo-execution-metadata", () => {
  it("attaches logo for route_visual merchandise jobs", () => {
    expect(
      shouldProactivelyAttachBrandLogo({
        metadata: { service: "merchandise", subtype: "jackets" },
        brief: "Jacket print for launch",
        capabilityId: "image.generate",
      })
    ).toBe(true);
  });

  it("does not attach when user chose create_new logo", () => {
    expect(
      shouldProactivelyAttachBrandLogo({
        metadata: { continuitySlotChoice: "create_new", service: "merchandise" },
        brief: "Design a new logo",
        capabilityId: "image.generate",
      })
    ).toBe(false);
  });

  it("merges profile logo into metadata assetIds", async () => {
    const meta = await ensureBrandLogoInExecutionMetadata({
      organizationId: "org",
      brandId: "brand",
      brief: "Jacket artwork",
      capabilityId: "image.generate",
      metadata: {
        service: "merchandise",
        productAction: "route_visual",
        brandLogoAssetId: "logo_asset_1",
      },
    });
    expect(meta.assetIds).toEqual(["logo_asset_1"]);
    expect(meta.brandLogoAssetId).toBe("logo_asset_1");
  });
});
