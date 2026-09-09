import {
  ensureBrandLogoInExecutionMetadata,
  shouldProactivelyAttachBrandLogo,
} from "../../../src/services/ensure-brand-logo-execution-metadata";
import mongoose from "mongoose";

jest.mock("../../../src/models/mediaFile.model", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: async () => null,
      }),
    })),
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
  },
}));

jest.mock("../../../src/platform/os/creative/brand-profile-facts", () => ({
  resolveBrandProfileContext: jest.fn(async () => ({
    logoAssetId: undefined,
    brandName: undefined,
    colors: [],
  })),
}));

import MediaFile from "../../../src/models/mediaFile.model";
import { resolveBrandProfileContext } from "../../../src/platform/os/creative/brand-profile-facts";

describe("ensure-brand-logo-execution-metadata", () => {
  beforeEach(() => {
    (MediaFile.find as jest.Mock).mockImplementation(() => ({
      select: () => ({
        lean: async () => [],
      }),
    }));
    (resolveBrandProfileContext as jest.Mock).mockResolvedValue({
      logoAssetId: undefined,
      brandName: undefined,
      colors: [],
    });
  });

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

  it("attaches logo for website service jobs", () => {
    expect(
      shouldProactivelyAttachBrandLogo({
        metadata: { service: "website" },
        brief: "Create a landing page",
        capabilityId: "text.generate",
      }),
    ).toBe(true);
  });

  it("merges profile logo into metadata assetIds", async () => {
    const meta = await ensureBrandLogoInExecutionMetadata({
      organizationId: new mongoose.Types.ObjectId().toString(),
      brandId: new mongoose.Types.ObjectId().toString(),
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

  it("asks when vault logo and attachment logo both exist", async () => {
    const vaultId = new mongoose.Types.ObjectId();
    const attachedId = new mongoose.Types.ObjectId().toString();
    (MediaFile.find as jest.Mock).mockImplementation(() => ({
      select: () => ({
        lean: async () => [
          {
            _id: vaultId,
            fileName: "Primary Logo",
            folder: "logos",
            kind: "image",
            mimeType: "image/png",
            approvalStatus: "approved",
            updatedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        ],
      }),
    }));

    const meta = await ensureBrandLogoInExecutionMetadata({
      organizationId: new mongoose.Types.ObjectId().toString(),
      brandId: new mongoose.Types.ObjectId().toString(),
      brief: "Use our logo on packaging",
      capabilityId: "image.generate",
      metadata: {
        service: "packaging",
        productAction: "route_visual",
        attachmentLogoAssetIds: [attachedId],
      },
    });

    expect(meta.logoChoiceRequired).toBe(true);
    const candidates = meta.logoChoiceCandidates as Array<{ assetId: string }>;
    expect(candidates.map((c) => c.assetId).sort()).toEqual(
      [vaultId.toString(), attachedId].sort()
    );
  });

  it("honors vaultLogoChoice without re-asking", async () => {
    const chosen = new mongoose.Types.ObjectId().toString();
    const meta = await ensureBrandLogoInExecutionMetadata({
      organizationId: new mongoose.Types.ObjectId().toString(),
      brandId: new mongoose.Types.ObjectId().toString(),
      brief: "Jacket with logo",
      capabilityId: "image.generate",
      metadata: {
        service: "merchandise",
        productAction: "route_visual",
        vaultLogoChoice: chosen,
        attachmentLogoAssetIds: [new mongoose.Types.ObjectId().toString()],
      },
    });
    expect(meta.logoChoiceRequired).toBeUndefined();
    expect(meta.brandLogoAssetId).toBe(chosen);
    expect(meta.assetIds).toContain(chosen);
  });
});
