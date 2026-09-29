/**
 * Regression: composed raster lifecycle
 *   blob put → finalize → promote(finalizedArtifactId) → vault ObjectId
 *
 * Proves the live C divergence fix: no art_composed_{hash} phantom identity,
 * no synthetic vaultIdFromHash as OCR-ready previewAssetRef.
 * No paid providers.
 */

import { createHash } from "crypto";
import { PNG } from "pngjs";
import { createAsyncMediaPlatform } from "../../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import {
  persistComposedDeliverableToVault,
  resolveComposedVaultBytesForTests,
  enrichCanonicalCandidateWithComposedDeliverable,
} from "../../../../src/platform/cdf/deterministic-composition";
import { isVaultAssetObjectIdShape } from "../../../../src/platform/cdf/artifacts/ids";
import { createTesseractRenderedTextProofProducer } from "../../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer";
import { evaluateStructuralCompositionCompliance } from "../../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { createMemoryVaultAssetResolver } from "../../../../src/platform/cdf/rendering/asset-resolver";
import {
  buildInstagramFeedPostCertFixture,
  CERT_PRIMARY_MESSAGE,
} from "../../../../src/platform/certification/fixtures/social-media-instagram-feed-post";
import type { ComposedDeliverable } from "../../../../src/platform/cdf/deterministic-composition/types";

function createTestAsyncMedia(repo?: InMemoryArtifactRepository) {
  return createAsyncMediaPlatform({
    env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
    forceInMemory: true,
    artifactsRepo: repo ?? new InMemoryArtifactRepository(),
    nowIso: () => "2026-09-15T12:00:00.000Z",
    clockMs: () => 1_757_900_100_000,
  });
}

function tinyComposedPng(): Buffer {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (64 * y + x) << 2;
      png.data[i] = 20 + (x % 200);
      png.data[i + 1] = 40 + (y % 200);
      png.data[i + 2] = 180;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function syntheticVaultIdFromHash(bytes: Buffer): string {
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return (contentHash + "000000000000000000000000").slice(0, 24);
}

describe("composed deliverable vault lifecycle (finalize → promote)", () => {
  it("1/2/3/5 — compose blob → finalize → promote uses finalize artifactId; no art_composed_*", async () => {
    const asyncMedia = createTestAsyncMedia();
    const composedBytes = tinyComposedPng();
    const executionId = "exec_lifecycle_compose_1";
    const organizationId = "org_lifecycle_1";

    const persisted = await persistComposedDeliverableToVault({
      composedBytes,
      mimeType: "image/png",
      executionId,
      organizationId,
      asyncMedia,
    });

    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    const expectedFinalizedId = `art_${executionId}_97`;
    expect(persisted.mediaArtifactId).toBe(expectedFinalizedId);
    expect(persisted.mediaArtifactId.startsWith("art_composed_")).toBe(false);
    expect(isVaultAssetObjectIdShape(persisted.vaultAssetId)).toBe(true);
    expect(persisted.vaultAssetId).not.toBe(syntheticVaultIdFromHash(composedBytes));

    const finalizedRows = asyncMedia.artifacts.listFinalized(executionId);
    expect(finalizedRows.some((r) => r.artifactId === expectedFinalizedId)).toBe(
      true,
    );
    const row = finalizedRows.find((r) => r.artifactId === expectedFinalizedId)!;
    expect(row.blob.storageKey).toMatch(
      new RegExp(`^composed/${organizationId}/${executionId}/`),
    );

    const fromMap = resolveComposedVaultBytesForTests(persisted.vaultAssetId);
    expect(fromMap?.bytes.length).toBe(composedBytes.length);
  });

  it("4 — synthetic vault id is never returned as production-ready vaultAssetId", async () => {
    const composedBytes = tinyComposedPng();
    const synthetic = syntheticVaultIdFromHash(composedBytes);
    const executionId = "exec_lifecycle_synth_fail";
    const organizationId = "org_lifecycle_synth";

    // Finalize returns an id but does not register blob resolution → promote fails.
    const asyncMedia = {
      blobStorage: {
        put: async () => ({ ok: true as const, value: { storageKey: "x" } }),
        get: async () => ({ ok: false as const, error: { message: "no" } }),
      },
      blobMetadata: {
        resolveForTenant: async () => null,
      },
      artifacts: {
        finalize: async (input: {
          operationId: string;
          outputIndex: number;
        }) => ({
          artifactId: `art_${input.operationId}_${input.outputIndex}`,
          blob: { storageKey: "composed/missing.png" },
        }),
        listFinalized: () => [],
      },
    };

    const persisted = await persistComposedDeliverableToVault({
      composedBytes,
      mimeType: "image/png",
      executionId,
      organizationId,
      asyncMedia: asyncMedia as never,
    });

    expect(persisted.ok).toBe(false);
    if (persisted.ok) return;
    expect(persisted.reason).toMatch(
      /composed_vault_promote_failed|execution_media_artifact_not_found/,
    );
    expect(resolveComposedVaultBytesForTests(synthetic)).toBeUndefined();
  });

  it("6 — OCR producer can read bytes from the promoted composed vault id", async () => {
    const asyncMedia = createTestAsyncMedia();
    const composedBytes = tinyComposedPng();
    const persisted = await persistComposedDeliverableToVault({
      composedBytes,
      mimeType: "image/png",
      executionId: "exec_lifecycle_ocr",
      organizationId: "org_lifecycle_ocr",
      asyncMedia,
    });
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    const mapped = resolveComposedVaultBytesForTests(persisted.vaultAssetId);
    expect(mapped).toBeDefined();

    const resolver = createMemoryVaultAssetResolver({
      [persisted.vaultAssetId]: mapped!.bytes,
    });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: (args) => resolver.resolve(args),
      timeoutMs: 60_000,
    });
    const proof = await producer({
      artifactRef: {
        vaultAssetId: persisted.vaultAssetId,
        organizationId: "org_lifecycle_ocr",
        mimeType: "image/png",
      },
    });
    expect(proof).not.toBeNull();
    expect(proof!.outcome).not.toBe("artifact_unavailable");
    expect(proof!.outcome === "ok" || proof!.outcome === "error").toBe(true);
    if (proof!.outcome === "error") {
      expect(proof!.failureReason).not.toMatch(/vault_bytes_missing|missing_vault/);
    }
  });

  it("7 — finalize/promote failure ⇒ composition persist is not production-ready", async () => {
    const asyncMedia = {
      blobStorage: {
        put: async () => ({ ok: true as const, value: {} }),
        get: async () => ({ ok: false as const, error: { message: "x" } }),
      },
      blobMetadata: { resolveForTenant: async () => null },
      artifacts: {
        finalize: async () => {
          throw new Error("forced_finalize_boom");
        },
        listFinalized: () => [],
      },
    };
    const persisted = await persistComposedDeliverableToVault({
      composedBytes: tinyComposedPng(),
      mimeType: "image/png",
      executionId: "exec_lifecycle_finalize_fail",
      organizationId: "org_x",
      asyncMedia: asyncMedia as never,
    });
    expect(persisted.ok).toBe(false);
    if (persisted.ok) return;
    expect(persisted.reason).toMatch(/composed_finalize_failed/);
  });

  it("8 — vault miss yields artifact_unavailable → rendered_text_presence UNVERIFIABLE", async () => {
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => undefined,
    });
    const proof = await producer({
      artifactRef: {
        vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        organizationId: "org_x",
      },
    });
    expect(proof!.outcome).toBe("artifact_unavailable");
    expect(proof!.failureReason).toBe("vault_bytes_missing");

    const fixture = buildInstagramFeedPostCertFixture();
    const { deriveVisualVerificationRequirements } = await import(
      "../../../../src/platform/cdf/generation-validation/visual-verification-requirements"
    );
    const vreqs = deriveVisualVerificationRequirements(
      fixture.compositionInput.contract,
    );
    const structural = evaluateStructuralCompositionCompliance({
      contract: fixture.compositionInput.contract,
      evidence: {
        hasPreviewAsset: true,
        expectedRenderedTexts: [CERT_PRIMARY_MESSAGE],
        renderedTextProof: proof!,
      },
      verificationRequirements: vreqs,
    });
    const presence = structural.criteria.find(
      (c) =>
        c.criterionId === "rendered_text_presence" ||
        c.criterion === "rendered_text_presence" ||
        (c as { id?: string }).id === "rendered_text_presence",
    );
    expect(presence).toBeDefined();
    expect(presence!.status).toBe("UNVERIFIABLE");
  });

  it("9 — raw art_* identity remains distinct from composed finalized identity", async () => {
    const asyncMedia = createTestAsyncMedia();
    const rawId = "art_syncimg_diagnostic_raw_0";
    const persisted = await persistComposedDeliverableToVault({
      composedBytes: tinyComposedPng(),
      mimeType: "image/png",
      executionId: "exec_lifecycle_raw_diag",
      organizationId: "org_lifecycle_raw",
      asyncMedia,
    });
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;
    expect(persisted.mediaArtifactId).not.toBe(rawId);
    expect(persisted.mediaArtifactId).toBe("art_exec_lifecycle_raw_diag_97");
  });

  it("10 — enrich candidate previewAssetRef.vaultAssetId is the promoted ObjectId", async () => {
    const asyncMedia = createTestAsyncMedia();
    const fixture = buildInstagramFeedPostCertFixture();
    const composedBytes = tinyComposedPng();
    const persisted = await persistComposedDeliverableToVault({
      composedBytes,
      mimeType: "image/png",
      executionId: "exec_lifecycle_enrich",
      organizationId: "org_lifecycle_enrich",
      asyncMedia,
    });
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    const composed: ComposedDeliverable = {
      ok: true,
      bytes: composedBytes,
      mimeType: "image/png",
      widthPx: 1080,
      heightPx: 1350,
      contentHash: persisted.contentHash,
      sourceVisualHash: "abc",
      layers: [],
      canvas: fixture.canvas,
      isFinalComposedDeliverable: true,
      rawVisualIsNotAcceptanceSubject: true,
    };

    const enriched = enrichCanonicalCandidateWithComposedDeliverable({
      baseCandidate: { kind: "image" },
      composed,
      vaultAssetId: persisted.vaultAssetId,
      primaryMessage: CERT_PRIMARY_MESSAGE,
      contract: fixture.compositionInput.contract,
    });

    const preview = enriched.previewAssetRef as { vaultAssetId: string };
    expect(preview.vaultAssetId).toBe(persisted.vaultAssetId);
    expect(isVaultAssetObjectIdShape(preview.vaultAssetId)).toBe(true);
    expect(String(preview.vaultAssetId).startsWith("art_")).toBe(false);
  });

  it("11 — hydration preserves authoritative composed artifact identity + bytes", async () => {
    const repo = new InMemoryArtifactRepository();
    const asyncMedia = createTestAsyncMedia(repo);
    const executionId = "exec_lifecycle_hydrate";
    const organizationId = "org_lifecycle_hydrate";
    const composedBytes = tinyComposedPng();

    const persisted = await persistComposedDeliverableToVault({
      composedBytes,
      mimeType: "image/png",
      executionId,
      organizationId,
      asyncMedia,
    });
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    // Simulate process-local map clear (restart) while durable artifact list remains.
    const g = globalThis as typeof globalThis & {
      __cdfVaultBytesMap?: Map<string, { bytes: Buffer; mimeType: string }>;
      __cdfVaultPromoteMap?: Map<string, string>;
    };
    g.__cdfVaultBytesMap = new Map();
    g.__cdfVaultPromoteMap = new Map();

    const listed = await repo.list(executionId);
    const composedArt = listed.find(
      (a) => a.artifactId === persisted.mediaArtifactId,
    );
    expect(composedArt).toBeDefined();
    expect(composedArt!.label).toMatch(/^blob:composed\//);

    // New artifact service against the same durable repo preserves identity.
    const { MediaArtifactService } = await import(
      "../../../../src/platform/media/artifacts/media-artifact-service"
    );
    const artifacts2 = new MediaArtifactService(repo);
    const storageKey = composedArt!.label.replace(/^blob:/, "");
    const again = await artifacts2.finalize({
      operationId: executionId,
      executionId,
      organizationId,
      outputIndex: 97,
      blob: {
        blobId: "blob_rehydrate",
        storageKey,
        organizationId,
        mimeType: "image/png",
        sizeBytes: composedBytes.length,
        checksum: persisted.contentHash,
        createdAt: "2026-09-15T12:00:01.000Z",
      },
      providerId: "composition",
      modelId: "deterministic",
      capabilityId: "deterministic_composition",
    });
    expect(again.artifactId).toBe(persisted.mediaArtifactId);

    // Blob bytes remain under the authoritative composed storage key.
    const got = await asyncMedia.blobStorage.get(storageKey);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const bytes = Buffer.from(
      (got.value as { data: string }).data,
      "base64",
    );
    expect(bytes.length).toBe(composedBytes.length);
  });
});
