/**
 * M10.15 — Voice / STT product path tests.
 */

process.env.PRODUCT_ASSET_STORAGE = "memory";

import mongoose from "mongoose";
import { ProductAssetService } from "../../../src/services/product-asset-service";
import {
  resolveProductAssetBlobStorage,
  setProductAssetBlobStorageForTests,
} from "../../../src/services/product-asset-storage";
import { VoicePromptService } from "../../../src/services/voice-prompt-service";
import { ApiError } from "../../../src/utils/apiError";

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
          if (
            q.organizationId &&
            d.organizationId?.toString() !== q.organizationId.toString()
          )
            return false;
          return true;
        });
        return rows;
      }),
      findById: jest.fn(async (id: string) => store.get(String(id)) || null),
      findOne: jest.fn(async (q: any) => {
        const rows = [...store.values()].filter((d) => {
          if (q.status?.$ne && d.status === q.status.$ne) return false;
          if (
            q.organizationId &&
            d.organizationId?.toString() !== q.organizationId.toString()
          )
            return false;
          if (q.checksum && d.checksum !== q.checksum) return false;
          if (q.folder && d.folder !== q.folder) return false;
          if (q.brandId && d.brandId?.toString() !== q.brandId.toString())
            return false;
          return true;
        });
        return rows[0] || null;
      }),
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
  default: { findById: jest.fn() },
}));

import Organizations from "../../../src/models/organization.model";
import Teams from "../../../src/models/team.model";
import MediaFile from "../../../src/models/mediaFile.model";

describe("M10.15 voice / STT", () => {
  const orgA = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    (MediaFile as any).__store.clear();
    setProductAssetBlobStorageForTests(
      resolveProductAssetBlobStorage({
        PRODUCT_ASSET_STORAGE: "memory",
      } as any)
    );
    (Organizations.exists as jest.Mock).mockResolvedValue({ _id: orgA });
    (Teams.exists as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
  });

  test("accepts m4a / wav / aac / mp3 MIME types on upload", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const cases = [
      { mime: "audio/mp4", name: "a.m4a" },
      { mime: "audio/m4a", name: "b.m4a" },
      { mime: "audio/wav", name: "c.wav" },
      { mime: "audio/aac", name: "d.aac" },
      { mime: "audio/mpeg", name: "e.mp3" },
    ] as const;

    for (const c of cases) {
      const dto = await service.upload({
        userId: userA.toString(),
        organizationId: orgA.toString(),
        filename: c.name,
        mimeType: c.mime,
        bytes: Buffer.from("fake-audio"),
        folder: "voice-prompts",
        tag: "voice_prompt",
      });
      expect(dto.kind).toBe("audio");
      expect(dto.mimeType).toBe(c.mime);
    }
  });

  test("resolveProviderInputAsset returns data-URL audio asset", async () => {
    const service = new ProductAssetService(
      resolveProductAssetBlobStorage({ PRODUCT_ASSET_STORAGE: "memory" } as any)
    );
    const dto = await service.upload({
      userId: userA.toString(),
      organizationId: orgA.toString(),
      filename: "voice-prompt.m4a",
      mimeType: "audio/mp4",
      bytes: Buffer.from("hello-audio"),
      tag: "voice_prompt",
    });
    const resolved = await service.resolveProviderInputAsset({
      userId: userA.toString(),
      assetId: dto.id,
      organizationId: orgA.toString(),
    });
    expect(resolved.mimeType).toMatch(/^audio\//);
    expect(resolved.url).toMatch(/^data:audio\//);
    expect(resolved.organizationId).toBe(orgA.toString());
  });

  test("VoicePromptService rejects unsupported mime before upload", async () => {
    const voice = new VoicePromptService();
    await expect(
      voice.uploadAndTranscribe({
        userId: userA.toString(),
        organizationId: orgA.toString(),
        filename: "x.ogg",
        mimeType: "audio/ogg",
        bytes: Buffer.from("x"),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("VoicePromptService cancel requires execution gateway", async () => {
    const voice = new VoicePromptService();
    await expect(
      voice.cancel({
        organizationId: orgA.toString(),
        executionId: "exec_missing",
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
