/**
 * Promoting the same execution image to the vault twice must return the same
 * vault asset. A new id per call made every re-ingest a "different payload"
 * (222 images had duplicate rows; 25 finished steps were flipped to failed).
 */

const rows: Array<{ _id: { toHexString(): string; toString(): string }; storageKey: string; tag: string; organizationId: unknown; status: string; createdAt: Date }> = [];

jest.mock("../../../src/models/mediaFile.model", () => {
  const matches = (filter: Record<string, unknown>) =>
    rows
      .filter(
        (r) =>
          r.storageKey === filter.storageKey &&
          r.tag === filter.tag &&
          r.status === filter.status &&
          String(r.organizationId) === String(filter.organizationId),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    __esModule: true,
    default: {
      findOne: jest.fn((filter: Record<string, unknown>) => ({
        sort: () => ({ lean: async () => matches(filter)[0] ?? null }),
      })),
      create: jest.fn(async (doc: Record<string, unknown>) => {
        await new Promise((r) => setTimeout(r, 5));
        rows.push({
          _id: doc._id as never,
          storageKey: String(doc.storageKey),
          tag: String(doc.tag),
          organizationId: doc.organizationId,
          status: String(doc.status),
          createdAt: new Date(),
        });
        return doc;
      }),
    },
  };
});

jest.mock(
  "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model",
  () => ({
    EnterpriseArtifact: {
      findOne: () => ({
        lean: () => ({ exec: async () => ({ label: "blob:tenant/org/exec/art_1.png" }) }),
      }),
    },
  }),
);

jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  const fake = {
    Types: actual.Types,
    isValidObjectId: actual.isValidObjectId,
    connection: { readyState: 1 },
  };
  return { __esModule: true, default: fake, ...fake };
});

jest.mock("../../../src/services/register-product-asset-blob-ownership", () => ({
  registerProductAssetBlobOwnership: jest.fn(async () => undefined),
}));

import mongoose from "mongoose";
import { promoteExecutionMediaArtifactToVaultAsset } from "../../../src/platform/cdf/generation-artifact/promote-execution-media-to-vault";

const ORG = "6ae884456338ffa100062324";
const asyncMedia = {
  artifacts: {},
  blobMetadata: { resolveForTenant: async () => ({ mimeType: "image/png", sizeBytes: 10 }) },
} as never;

describe("promoteExecutionMediaArtifactToVaultAsset — idempotent", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("returns the same vault asset when the same image is promoted again", async () => {
    const input = { mediaArtifactId: "art_1", organizationId: ORG, executionId: "exec_1", asyncMedia };
    const first = await promoteExecutionMediaArtifactToVaultAsset(input);
    const second = await promoteExecutionMediaArtifactToVaultAsset(input);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.vaultAssetId).toBe(first.vaultAssetId);
    expect(rows).toHaveLength(1);
  });

  it("parallel polls of one execution create one row", async () => {
    const input = { mediaArtifactId: "art_1", organizationId: ORG, executionId: "exec_1", asyncMedia };
    const results = await Promise.all([1, 2, 3, 4].map(() => promoteExecutionMediaArtifactToVaultAsset(input)));
    const ids = new Set(results.map((r) => (r.ok ? r.vaultAssetId : "x")));
    expect(ids.size).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("reuses the earliest row when duplicates already exist (pre-fix data)", async () => {
    const early = new mongoose.Types.ObjectId();
    rows.push(
      { _id: early, storageKey: "tenant/org/exec/art_1.png", tag: "cdf-canonical-preview", organizationId: ORG, status: "active", createdAt: new Date("2026-11-05T06:23:29Z") },
      { _id: new mongoose.Types.ObjectId(), storageKey: "tenant/org/exec/art_1.png", tag: "cdf-canonical-preview", organizationId: ORG, status: "active", createdAt: new Date("2026-11-06T06:28:30Z") },
    );
    const r = await promoteExecutionMediaArtifactToVaultAsset({ mediaArtifactId: "art_1", organizationId: ORG, executionId: "exec_1", asyncMedia });
    expect(r.ok && r.vaultAssetId).toBe(early.toHexString());
  });
});
