/**
 * M10.18 — Production asset / storage / media infrastructure tests.
 */

process.env.PRODUCT_ASSET_STORAGE = "memory";
process.env.PRODUCT_ASSET_DEDUPE = "true";

import mongoose from "mongoose";
import { createHash } from "crypto";
import {
  ProductAssetService,
  buildProductAssetStorageKey,
} from "../../../src/services/product-asset-service";
import {
  resolveProductAssetBlobStorage,
  setProductAssetBlobStorageForTests,
} from "../../../src/services/product-asset-storage";
import {
  runUploadPipeline,
  sha256Hex,
  cacheControlForAsset,
} from "../../../src/platform/media/upload/upload-pipeline";
import {
  setVirusScanHookForTests,
  type IVirusScanHook,
} from "../../../src/platform/media/upload/virus-scan-hook";
import { extractBasicMediaMeta } from "../../../src/platform/media/processing/media-metadata-extractor";
import { supportsMultipart } from "../../../src/platform/persistence/storage/multipart-blob-storage";
import { MediaArtifactService } from "../../../src/platform/media/artifacts/media-artifact-service";

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
      find: jest.fn(async (q: any) =>
        [...store.values()].filter((d) => {
          if (q.status?.$ne && d.status === q.status.$ne) return false;
          if (
            q.organizationId &&
            d.organizationId?.toString() !== q.organizationId.toString()
          )
            return false;
          return true;
        })
      ),
      findOne: jest.fn(async (q: any) => {
        const rows = [...store.values()].filter((d) => {
          if (q.status?.$ne && d.status === q.status.$ne) return false;
          if (
            q.organizationId &&
            d.organizationId?.toString() !== q.organizationId.toString()
          )
            return false;
          if (q.checksum && d.checksum !== q.checksum) return false;
          return true;
        });
        return rows[0] || null;
      }),
      findById: jest.fn(async (id: string) => store.get(String(id)) || null),
      __store: store,
    },
  };
});

jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: { exists: jest.fn(), findOne: jest.fn() },
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
  default: { findById: jest.fn() },
}));
jest.mock("../../../src/models/multipart-upload-session.model", () => {
  const store = new Map<string, any>();
  return {
    __esModule: true,
    MultipartUploadSession: {
      create: jest.fn(async (doc: any) => {
        const saved = {
          ...doc,
          parts: doc.parts || [],
          save: jest.fn(async function (this: any) {
            store.set(this.uploadId, this);
            return this;
          }),
        };
        store.set(doc.uploadId, saved);
        return saved;
      }),
      findOne: jest.fn(async (q: any) => store.get(q.uploadId) || null),
      __store: store,
    },
  };
});
jest.mock("../../../src/platform/media/processing/media-processing-job-store", () => ({
  enqueuePostUploadJobs: jest.fn(async () => undefined),
  enqueueMediaJob: jest.fn(async () => undefined),
}));
jest.mock("../../../src/platform/media/audit/media-access-audit", () => ({
  auditMediaAccess: jest.fn(async () => undefined),
}));

import Organizations from "../../../src/models/organization.model";
import Teams from "../../../src/models/team.model";
import MediaFile from "../../../src/models/mediaFile.model";
import { MultipartUploadSession } from "../../../src/models/multipart-upload-session.model";
import { enqueuePostUploadJobs } from "../../../src/platform/media/processing/media-processing-job-store";
import { auditMediaAccess } from "../../../src/platform/media/audit/media-access-audit";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("M10.18 production media infrastructure", () => {
  const orgA = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    (MediaFile as any).__store.clear();
    (MultipartUploadSession as any).__store.clear();
    setProductAssetBlobStorageForTests(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    setVirusScanHookForTests(undefined);
    (Organizations.exists as jest.Mock).mockImplementation(async (q: any) => {
      if (
        q.owner?.toString() === userA.toString() &&
        q._id?.toString() === orgA.toString()
      )
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

  it("computes sha256 and validates MIME/size in upload pipeline", async () => {
    const checksum = sha256Hex(PNG);
    expect(checksum).toHaveLength(64);
    const ok = await runUploadPipeline({
      filename: "dot.png",
      mimeType: "image/png",
      bytes: PNG,
      organizationId: orgA.toString(),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.checksum).toBe(checksum);

    const bad = await runUploadPipeline({
      filename: "x.exe",
      mimeType: "application/x-msdownload",
      bytes: Buffer.from([1]),
      organizationId: orgA.toString(),
    });
    expect(bad.ok).toBe(false);
  });

  it("rejects infected uploads via virus scan hook", async () => {
    const infected: IVirusScanHook = {
      async scan() {
        return {
          verdict: "infected",
          engine: "test",
          detail: "eicar",
          scannedAt: new Date().toISOString(),
        };
      },
    };
    setVirusScanHookForTests(infected);
    const result = await runUploadPipeline({
      filename: "bad.png",
      mimeType: "image/png",
      bytes: PNG,
      organizationId: orgA.toString(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(422);
  });

  it("persists checksum on upload and enqueues background jobs", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "dot.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    expect(asset.checksum).toBe(createHash("sha256").update(PNG).digest("hex"));
    expect(asset.etag).toBe(asset.checksum);
    expect(enqueuePostUploadJobs).toHaveBeenCalled();
    expect(auditMediaAccess).toHaveBeenCalled();
  });

  it("deduplicates by organization checksum", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const a1 = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "a.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    const a2 = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "b.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    expect(a2.id).toBe(a1.id);
  });

  it("issues signed media with disposition + audits download", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "dot.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    const media = await service.getMedia({
      userId: userA.toString(),
      assetId: asset.id,
      disposition: "attachment",
    });
    expect(media.mediaUrl.startsWith("data:")).toBe(true);
    expect(media.expiresInSeconds).toBeGreaterThan(0);
    expect(media.cacheControl).toContain("private");
    expect(auditMediaAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "download" })
    );
  });

  it("blocks cross-tenant media and audits rejection", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "secret.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    (Organizations.exists as jest.Mock).mockResolvedValue(null);
    (Teams.exists as jest.Mock).mockResolvedValue(null);
    await expect(
      service.getMedia({ userId: userB.toString(), assetId: asset.id })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(auditMediaAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cross_tenant_rejected", success: false })
    );
  });

  it("soft-deletes without immediate blob purge and restores", async () => {
    const storage = resolveProductAssetBlobStorage({
      PRODUCT_ASSET_STORAGE: "memory",
    } as any);
    const service = new ProductAssetService(storage);
    const asset = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "keep.png",
      mimeType: "image/png",
      bytes: PNG,
    });
    const key = buildProductAssetStorageKey({
      organizationId: orgA.toString(),
      assetId: asset.id,
      filename: "keep.png",
    });
    await service.delete({ userId: userA.toString(), assetId: asset.id });
    const stillThere = await storage.get(key);
    expect(stillThere.ok && stillThere.value).toBeTruthy();

    const restored = await service.restore({
      userId: userA.toString(),
      assetId: asset.id,
    });
    expect(restored.status).toBe("active");
  });

  it("supports multipart initiate → part → complete → abort cancel path", async () => {
    const storage = resolveProductAssetBlobStorage({
      PRODUCT_ASSET_STORAGE: "memory",
    } as any);
    expect(supportsMultipart(storage)).toBe(true);
    const service = new ProductAssetService(storage);

    const init = await service.initiateMultipart({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "big.png",
      mimeType: "image/png",
    });
    expect(init.uploadId).toBeTruthy();

    const part = await service.uploadMultipartPart({
      userId: userA.toString(),
      uploadId: init.uploadId,
      partNumber: 1,
      bytes: PNG,
    });
    expect(part.etag).toBeTruthy();

    const completed = await service.completeMultipart({
      userId: userA.toString(),
      uploadId: init.uploadId,
    });
    expect(completed.lifecycle).toBe("published");
    expect(completed.checksum).toBeTruthy();

    const init2 = await service.initiateMultipart({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "cancel.png",
      mimeType: "image/png",
    });
    const aborted = await service.abortMultipart({
      userId: userA.toString(),
      uploadId: init2.uploadId,
    });
    expect(aborted.status).toBe("aborted");
  });

  it("extracts PNG dimensions for metadata processing", () => {
    const meta = extractBasicMediaMeta({ mimeType: "image/png", bytes: PNG });
    expect(meta.image?.width).toBe(1);
    expect(meta.image?.height).toBe(1);
    expect(cacheControlForAsset("artifact_immutable")).toContain("immutable");
  });

  it("keeps execution artifacts immutable on re-finalize checksum conflict", async () => {
    const artifacts = {
      get: jest.fn(async () => undefined),
      list: jest.fn(async () => []),
      save: jest.fn(async () => undefined),
    };
    const svc = new MediaArtifactService(artifacts as any);
    const blob1 = {
      blobId: "b1",
      storageKey: "k1",
      organizationId: "org",
      mimeType: "image/png",
      sizeBytes: 10,
      checksum: "aaa",
      createdAt: new Date().toISOString(),
    };
    const first = await svc.finalize({
      operationId: "op1",
      executionId: "ex1",
      organizationId: "org",
      outputIndex: 0,
      blob: blob1,
      providerId: "p",
      modelId: "m",
      capabilityId: "c",
      promptHash: "ph",
      brandId: "br",
    });
    expect(first.promptHash).toBe("ph");
    const second = await svc.finalize({
      operationId: "op1",
      executionId: "ex1",
      organizationId: "org",
      outputIndex: 0,
      blob: { ...blob1, checksum: "bbb" },
      providerId: "p",
      modelId: "m",
      capabilityId: "c",
    });
    expect(second.blob.checksum).toBe("aaa");
  });
});
