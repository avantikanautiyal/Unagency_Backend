/**
 * Regression: art_syncimg_* → bytes → VisualGenerationResult → compositor.
 * No live providers. Proves the blob_bytes_missing integration fix.
 */

import { PNG } from "pngjs";
import { createAsyncMediaPlatform } from "../../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { materializeSyncImageArtifacts } from "../../../../src/platform/api/services/sync-image-artifact-materializer";
import {
  loadExecutionMediaBytes,
  normalizeVisualGenerationResult,
  acceptComposedLeaf,
  resolveSharedCompositionAuthority,
  composedDiffersFromVisualPlate,
} from "../../../../src/platform/cdf/deterministic-composition";
import {
  buildInstagramFeedPostCertFixture,
  CERT_PRIMARY_MESSAGE,
} from "../../../../src/platform/certification/fixtures/social-media-instagram-feed-post";

function createTestAsyncMedia() {
  return createAsyncMediaPlatform({
    env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
    forceInMemory: true,
    artifactsRepo: new InMemoryArtifactRepository(),
    nowIso: () => "2026-09-15T00:00:00.000Z",
    clockMs: () => 1_757_900_000_000,
  });
}

function tinyPngBase64(): string {
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = (32 * y + x) << 2;
      png.data[i] = 40 + x;
      png.data[i + 1] = 80 + y;
      png.data[i + 2] = 160;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

describe("art_syncimg_* byte resolution for composition bridge", () => {
  it("A/B — materialized art_syncimg_* resolves to actual bytes (not artifact id only)", async () => {
    const asyncMedia = createTestAsyncMedia();
    const base64 = tinyPngBase64();
    const materialized = await materializeSyncImageArtifacts({
      asyncMedia,
      executionId: "exec_byte_res_1",
      organizationId: "org_byte_res",
      providerId: "provider.example",
      modelId: "example-image-1",
      capabilityId: "image.generate",
      runtimeOutput: {
        outputs: [
          {
            type: "image",
            mimeType: "image/png",
            base64,
          },
        ],
      },
      createId: (prefix) => `${prefix}_test_1`,
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const artId = materialized.value[0]!;
    expect(artId.startsWith("art_")).toBe(true);

    const loaded = await loadExecutionMediaBytes({
      mediaArtifactId: artId,
      organizationId: "org_byte_res",
      asyncMedia,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.bytes.length).toBeGreaterThan(8);
    expect(loaded.mimeType).toMatch(/^image\//);

    const visual = normalizeVisualGenerationResult({
      bytes: loaded.bytes,
      mimeType: loaded.mimeType,
      provenance: "generated",
      generationMeta: { mediaArtifactId: artId },
    });
    expect("ok" in visual && visual.ok === false).toBe(false);
    expect((visual as { bytes: Buffer }).bytes.length).toBe(loaded.bytes.length);
  });

  it("C/D/E/G — resolved bytes → composition → distinct composed raster; raw not acceptance subject", async () => {
    const asyncMedia = createTestAsyncMedia();
    const fixture = buildInstagramFeedPostCertFixture();
    const visualB64 = fixture.visualBytes.toString("base64");

    const materialized = await materializeSyncImageArtifacts({
      asyncMedia,
      executionId: "exec_byte_res_compose",
      organizationId: "org_byte_res",
      providerId: "provider.example",
      modelId: "example-image-1",
      capabilityId: "image.generate",
      runtimeOutput: {
        outputs: [{ type: "image", mimeType: "image/png", base64: visualB64 }],
      },
      createId: (prefix) => `${prefix}_compose_1`,
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const artId = materialized.value[0]!;

    const loaded = await loadExecutionMediaBytes({
      mediaArtifactId: artId,
      organizationId: "org_byte_res",
      asyncMedia,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const authority = resolveSharedCompositionAuthority({
      contract: fixture.compositionInput.contract,
      canvas: fixture.canvas,
      primaryMessage: CERT_PRIMARY_MESSAGE,
      brandMark: fixture.compositionInput.brandMark!,
      selectedRoute: {
        artifactId: "cdfart_routes_shared",
        artifactVersion: 1,
        artifactKey: "social-media.routes",
      },
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;

    const acceptance = acceptComposedLeaf({
      authority: authority.authority,
      visual: {
        bytes: loaded.bytes,
        mimeType: loaded.mimeType,
        provenance: "generated",
        generationMeta: { mediaArtifactId: artId },
      },
      identity: {
        executionId: "exec_byte_res_compose",
        providerId: "provider.example",
        modelId: "example-image-1",
      },
      renderedTextProof: {
        source: "ocr",
        outcome: "ok",
        extractedText: CERT_PRIMARY_MESSAGE,
      },
    });

    expect(acceptance.ok).toBe(true);
    if (!acceptance.ok) return;
    expect(acceptance.composed.isFinalComposedDeliverable).toBe(true);
    expect(acceptance.composed.rawVisualIsNotAcceptanceSubject).toBe(true);
    expect(composedDiffersFromVisualPlate(acceptance.composed)).toBe(true);
    expect(acceptance.composed.contentHash).not.toBe(
      acceptance.composed.sourceVisualHash,
    );
    // Raw art id is not the composed subject
    expect(artId.startsWith("art_")).toBe(true);
    expect(acceptance.composed.mimeType).toBe("image/png");
  });

  it("F — missing / unknown art_* fails closed with structured reason", async () => {
    const asyncMedia = createTestAsyncMedia();
    const loaded = await loadExecutionMediaBytes({
      mediaArtifactId: "art_syncimg_missing_0",
      organizationId: "org_byte_res",
      asyncMedia,
    });
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(
      loaded.reason === "execution_media_artifact_not_found" ||
        loaded.reason === "blob_bytes_missing" ||
        loaded.reason.startsWith("load_media_failed"),
    ).toBe(true);
  });

  it("H — empty artifact id fails closed", async () => {
    const asyncMedia = createTestAsyncMedia();
    const loaded = await loadExecutionMediaBytes({
      mediaArtifactId: "   ",
      organizationId: "org_byte_res",
      asyncMedia,
    });
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toBe("missing_media_artifact_id");
  });
});
