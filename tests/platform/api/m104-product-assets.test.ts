/**
 * M10.4 product asset service — memory storage, no AWS / AI.
 */

process.env.PRODUCT_ASSET_STORAGE = "memory";

import mongoose from "mongoose";
import {
  ProductAssetService,
  sanitizeFilename,
  buildProductAssetStorageKey,
  assertUserBelongsToOrganization,
} from "../../../src/services/product-asset-service";
import {
  resolveProductAssetBlobStorage,
  setProductAssetBlobStorageForTests,
} from "../../../src/services/product-asset-storage";
import { upsertCanonicalCategories } from "../../../scripts/seed-categories";

jest.mock("../../../src/models/mediaFile.model", () => {
  const store = new Map<string, any>();
  return {
    __esModule: true,
    default: {
      create: jest.fn(async (doc: any) => {
        const id = doc._id?.toString() || new mongoose.Types.ObjectId().toString();
        const saved = {
          ...doc,
          _id: new mongoose.Types.ObjectId(id),
          save: jest.fn(async function (this: any) {
            store.set(this._id.toString(), this);
            return this;
          }),
        };
        store.set(id, saved);
        return saved;
      }),
      find: jest.fn(async (q: any) => {
        const rows = [...store.values()].filter((d) => {
          if (q.status?.$ne && d.status === q.status.$ne) return false;
          if (q.organizationId && d.organizationId?.toString() !== q.organizationId.toString())
            return false;
          return true;
        });
        return rows;
      }),
      findById: jest.fn(async (id: string) => store.get(String(id)) || null),
      __store: store,
    },
  };
});

jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: {
    exists: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock("../../../src/models/team.model", () => ({
  __esModule: true,
  default: { exists: jest.fn(), findOne: jest.fn() },
}));

jest.mock("../../../src/models/projects.model", () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock("../../../src/models/requestProject.model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("../../../src/models/categories.model", () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: jest.fn(async (_q: any, update: any) => ({
      _id: new mongoose.Types.ObjectId(),
      ...update.$set,
    })),
  },
}));

import Organizations from "../../../src/models/organization.model";
import Teams from "../../../src/models/team.model";
import MediaFile from "../../../src/models/mediaFile.model";

describe("M10.4 product assets + category bootstrap", () => {
  const orgA = new mongoose.Types.ObjectId();
  const orgB = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    (MediaFile as any).__store.clear();
    setProductAssetBlobStorageForTests(resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any));
    (Organizations.exists as jest.Mock).mockImplementation(async (q: any) => {
      if (q.owner?.toString() === userA.toString() && q._id?.toString() === orgA.toString())
        return true;
      return null;
    });
    (Organizations.findOne as jest.Mock).mockImplementation(async (q: any) => {
      if (q.owner?.toString() === userA.toString()) return { _id: orgA };
      return null;
    });
    (Teams.exists as jest.Mock).mockResolvedValue(null);
    (Teams.findOne as jest.Mock).mockResolvedValue(null);
  });

  it("sanitizes path traversal filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a/b\\c.png")).toBe("c.png");
  });

  it("builds tenant-scoped storage keys", () => {
    const key = buildProductAssetStorageKey({
      organizationId: "org1",
      assetId: "asset1",
      filename: "logo.png",
    });
    expect(key).toBe("tenant/org1/assets/asset1/logo.png");
  });

  it("upserts canonical categories idempotently", async () => {
    const n1 = await upsertCanonicalCategories();
    const n2 = await upsertCanonicalCategories();
    expect(n1).toBe(10);
    expect(n2).toBe(10);
    expect((await import("../../../src/models/categories.model")).default.findOneAndUpdate).toHaveBeenCalled();
  });

  it("uploads and lists assets for Tenant A", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "dot.png",
      mimeType: "image/png",
      bytes: png,
    });
    expect(asset.organizationId).toBe(orgA.toString());
    expect(asset.kind).toBe("image");

    const list = await service.list({
      userId: userA.toString(),
      organizationId: orgA.toString(),
    });
    expect(list.some((a) => a.id === asset.id)).toBe(true);

    const media = await service.getMedia({
      userId: userA.toString(),
      assetId: asset.id,
    });
    expect(media.mediaUrl.startsWith("data:")).toBe(true);
  });

  it("rejects zero-byte and invalid MIME", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    await expect(
      service.upload({
        userId: userA.toString(),
        organizationId: orgA.toString(),
        filename: "x.bin",
        mimeType: "application/x-msdownload",
        bytes: Buffer.from([1]),
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.upload({
        userId: userA.toString(),
        organizationId: orgA.toString(),
        filename: "empty.png",
        mimeType: "image/png",
        bytes: Buffer.alloc(0),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks cross-tenant read/delete", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "secret.png",
      mimeType: "image/png",
      bytes: png,
    });

    (Organizations.exists as jest.Mock).mockResolvedValue(null);
    (Teams.exists as jest.Mock).mockResolvedValue(null);

    await expect(
      service.get({ userId: userB.toString(), assetId: asset.id })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.getMedia({ userId: userB.toString(), assetId: asset.id })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.delete({ userId: userB.toString(), assetId: asset.id })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("does not silently use memory in production without explicit flag", () => {
    const storage = resolveProductAssetBlobStorage({
      NODE_ENV: "production",
    } as any);
    expect(storage.mode).toBe("unavailable");
  });

  it("assertUserBelongsToOrganization fails for foreign org", async () => {
    (Organizations.exists as jest.Mock).mockResolvedValue(null);
    (Teams.exists as jest.Mock).mockResolvedValue(null);
    await expect(
      assertUserBelongsToOrganization(userA.toString(), orgB.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
