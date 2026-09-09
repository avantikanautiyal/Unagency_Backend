import {
  applyVaultLogoSelection,
  resolveBrandVaultLogos,
  type VaultLogoCandidate,
} from "../../../src/services/brand-vault-logo-resolver";
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

import MediaFile from "../../../src/models/mediaFile.model";

describe("brand-vault-logo-resolver", () => {
  it("binds a selected vault logo into the continuity resolve result", () => {
    const resolved = applyVaultLogoSelection({
      resolve: {
        resolved: [],
        missingRequiredSlots: ["logo"],
        assets: [],
        facts: [],
        negatives: [],
        provenanceParts: [],
      },
      assetId: "vault_logo_2",
    });
    expect(resolved.missingRequiredSlots).not.toContain("logo");
    expect(resolved.assets[0]?.assetId).toBe("vault_logo_2");
    expect(resolved.provenanceParts).toContain("Brand vault logo");
  });

  it("sorts approved vault logos ahead of drafts", () => {
    const candidates: VaultLogoCandidate[] = [
      {
        assetId: "draft",
        name: "Draft logo",
        approvalStatus: "none",
        updatedAt: "2026-08-25T12:00:00.000Z",
      },
      {
        assetId: "approved",
        name: "Approved logo",
        approvalStatus: "approved",
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
    ];
    const sorted = [...candidates].sort((a, b) => {
      const approvedScore = (c: VaultLogoCandidate) =>
        c.approvalStatus === "approved" ? 1 : 0;
      const approvedDiff = approvedScore(b) - approvedScore(a);
      if (approvedDiff !== 0) return approvedDiff;
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bt - at;
    });
    expect(sorted[0]?.assetId).toBe("approved");
  });

  it("accepts logos-folder assets even when kind is not image", async () => {
    const logoId = new mongoose.Types.ObjectId();
    (MediaFile.find as jest.Mock).mockImplementation(() => ({
      select: () => ({
        lean: async () => [
          {
            _id: logoId,
            fileName: "brand-mark.svg",
            folder: "logos",
            kind: "document",
            mimeType: "image/svg+xml",
            approvalStatus: "approved",
            updatedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        ],
      }),
    }));
    const vault = await resolveBrandVaultLogos({
      organizationId: new mongoose.Types.ObjectId().toString(),
      brandId: new mongoose.Types.ObjectId().toString(),
    });
    expect(vault.selectedAssetId).toBe(logoId.toString());
  });

  it("requires choice when multiple vault logos exist even if one is approved", async () => {
    const approvedId = new mongoose.Types.ObjectId();
    const draftId = new mongoose.Types.ObjectId();
    (MediaFile.find as jest.Mock).mockImplementation(() => ({
      select: () => ({
        lean: async () => [
          {
            _id: approvedId,
            fileName: "Approved logo",
            folder: "logos",
            kind: "image",
            mimeType: "image/png",
            approvalStatus: "approved",
            updatedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
          {
            _id: draftId,
            fileName: "Draft logo",
            folder: "logos",
            kind: "image",
            mimeType: "image/png",
            approvalStatus: "none",
            updatedAt: new Date("2026-08-20T00:00:00.000Z"),
          },
        ],
      }),
    }));
    const vault = await resolveBrandVaultLogos({
      organizationId: new mongoose.Types.ObjectId().toString(),
      brandId: new mongoose.Types.ObjectId().toString(),
    });
    expect(vault.needsChoice).toBe(true);
    expect(vault.selectedAssetId).toBeUndefined();
    expect(vault.candidates).toHaveLength(2);
  });
});
