/**
 * CDF M9E — Social Media canonical rendering (shared M5 RendererRegistry).
 */

jest.mock("../../../src/platform/api/services/sync-image-artifact-materializer", () => ({
  materializeSyncImageArtifacts: jest.fn(async () => {
    throw new Error("AI/legacy isolation: sync-image materializer must not run during M9E render");
  }),
}));

import {
  applyCdfTransition,
  assertSocialMediaUpstreamExactRefs,
  bindGeneratedSocialMediaArtifactToSession,
  computeRenderKey,
  createArtifact,
  createMemoryVaultAssetResolver,
  createVersion,
  CdfRenderError,
  fixtureSocialMediaOutput,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaSizeReference,
  getArtifactVersion,
  getCdfSession,
  getRenderedBlob,
  getRenderedFile,
  hasRendererCapability,
  listRegisteredRenderers,
  markApproved,
  markRejected,
  markValidated,
  readPngDimensions,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveRenderer,
  selectSocialMediaPreviewVaultId,
  sha256Hex,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_CONFIRMED_REPRESENTATIONS,
  SOCIAL_MEDIA_FIXTURE_IDS,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
  SOCIAL_MEDIA_RENDER_CONTRACT,
  SOCIAL_MEDIA_UNRESOLVED_REPRESENTATIONS,
  socialMediaUnsupportedFormatMessage,
} from "../../../src/platform/cdf";
import { materializeSyncImageArtifacts } from "../../../src/platform/api/services/sync-image-artifact-materializer";
import { ProductAssetService } from "../../../src/services/product-asset-service";

/** Minimal 1×1 PNG — matches IHDR when canvas is overridden to 1×1. */
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const TINY_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const VAULT_V2 = "507f1f77bcf86cd799439099";

describe("CDF M9E Social Media Rendering", () => {
  let getMediaSpy: jest.SpyInstance;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests({
      registerFixtureRenderer: false,
      registerPresentationRenderers: true,
      registerPackagingRenderers: true,
      registerSocialMediaRenderers: true,
    });
    jest.clearAllMocks();
    getMediaSpy = jest
      .spyOn(ProductAssetService.prototype, "getMedia")
      .mockImplementation(async () => {
        throw new Error("Legacy isolation: getMedia must not run during M9E render");
      });
  });

  afterEach(() => {
    getMediaSpy.mockRestore();
  });

  function startSession(org = "org_m9e", proj = "proj_m9e") {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: org,
      projectId: proj,
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Mango drink social post",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function vault(map?: Record<string, Uint8Array>) {
    return createMemoryVaultAssetResolver({
      [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage]: TINY_PNG,
      [VAULT_V2]: TINY_JPEG,
      ...map,
    });
  }

  function seedUpstream(sessionId: string, org = "org_m9e", proj = "proj_m9e") {
    const platform = createArtifact({
      organizationId: org,
      projectId: proj,
      sessionId,
      serviceId: "social-media",
      phaseId: "platform",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      artifactType: "config_choice",
      data: fixtureSocialMediaPlatform() as never,
    });
    const size = createArtifact({
      organizationId: org,
      projectId: proj,
      sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference(
        platform.artifact.artifactId,
        1,
      ) as never,
    });
    const routes = createArtifact({
      organizationId: org,
      projectId: proj,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes(
        size.artifact.artifactId,
        1,
        platform.artifact.artifactId,
      ) as never,
    });
    return { platform, size, routes };
  }

  function outputData(
    routesId: string,
    platformId: string,
    sizeId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const base = fixtureSocialMediaOutput(routesId, 1);
    return {
      ...base,
      platformRef: {
        artifactId: platformId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      },
      sizeReferenceRef: {
        artifactId: sizeId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      },
      // Match TINY_PNG IHDR — never silently resize in renderer.
      canvas: {
        ...base.canvas,
        widthPx: 1,
        heightPx: 1,
      },
      ...overrides,
    };
  }

  async function renderApprovedOutput(opts?: {
    version?: number;
    format?: "png" | "jpg";
    purpose?: "preview" | "final";
    org?: string;
    proj?: string;
    bytes?: Uint8Array;
    dataOverrides?: Record<string, unknown>;
  }) {
    const org = opts?.org ?? "org_m9e";
    const proj = opts?.proj ?? "proj_m9e";
    const session = startSession(org, proj);
    const { platform, size, routes } = seedUpstream(session.sessionId, org, proj);
    const out = createArtifact({
      organizationId: org,
      projectId: proj,
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
        opts?.dataOverrides,
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);
    const file = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: opts?.version ?? 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: opts?.format ?? "png",
        purpose: opts?.purpose ?? "final",
        organizationId: org,
        projectId: proj,
      },
      {
        vaultAssetResolver: vault(
          opts?.bytes
            ? { [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage]: opts.bytes }
            : undefined,
        ),
      },
    );
    return { out, file, session, platform, size, routes };
  }

  it("A — REGISTRY: social-media-preview-raster registered; capability matrix", () => {
    expect(
      hasRendererCapability({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
      }),
    ).toBe(true);
    expect(
      hasRendererCapability({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "preview",
      }),
    ).toBe(true);
    expect(
      listRegisteredRenderers().some(
        (r) => r.rendererId === SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID,
      ),
    ).toBe(true);
    expect(SOCIAL_MEDIA_RENDER_CONTRACT.rendererVersion).toBe(
      SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
    );
    expect(SOCIAL_MEDIA_CONFIRMED_REPRESENTATIONS.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      SOCIAL_MEDIA_UNRESOLVED_REPRESENTATIONS.some((u) => u.format === "gif"),
    ).toBe(true);
    expect(SOCIAL_MEDIA_RENDER_CONTRACT.neverSilentLegacyFallback).toBe(true);
    expect(SOCIAL_MEDIA_RENDER_CONTRACT.liveTrafficMigrated).toBe(false);
  });

  it("B/J/L — EXACT VERSION: v1 vs v2 isolation; renderKey includes version", async () => {
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);

    const v1 = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );

    createVersion({
      artifactId: out.artifact.artifactId,
      expectedLatestVersion: 1,
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
        {
          compositionNotes: "v2 observable difference",
          previewAssetRef: {
            vaultAssetId: VAULT_V2,
            role: "creative_preview",
            label: "v2 jpeg",
          },
          sourceRefs: {
            executionId: "exec_social_fixture_2",
            upstreamArtifactRefs: [
              {
                artifactId: routes.artifact.artifactId,
                version: 1,
                artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
              },
            ],
            vaultAssetIds: [VAULT_V2],
          },
        },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 2);
    markApproved(out.artifact.artifactId, 2);

    const v2 = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 2,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );

    const againV1 = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );

    expect(v1.artifactVersion).toBe(1);
    expect(v2.artifactVersion).toBe(2);
    expect(v1.renderKey).not.toBe(v2.renderKey);
    expect(v1.checksum).not.toBe(v2.checksum);
    expect(againV1.fileId).toBe(v1.fileId);
    expect(againV1.checksum).toBe(v1.checksum);
    expect(getRenderedBlob(v1.storageKey)?.bytes[0]).toBe(0x89);
    expect(getRenderedBlob(v2.storageKey)?.bytes[0]).toBe(0xff);
    expect(
      computeRenderKey({
        artifactId: v1.artifactId,
        artifactVersion: 1,
        format: "png",
        purpose: "final",
        rendererId: v1.rendererId,
        rendererVersion: v1.rendererVersion,
        optionsHash: v1.renderOptionsHash,
      }),
    ).toBe(v1.renderKey);
  });

  it("C/E/H/I/X — PNG capability; exact dims; metadata; checksum; deterministic", async () => {
    const { file } = await renderApprovedOutput();
    expect(file.rendererId).toBe(SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID);
    expect(file.rendererVersion).toBe(
      SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
    );
    expect(file.mimeType).toBe("image/png");
    expect(file.format).toBe("png");
    expect(file.checksum).toBe(sha256Hex(TINY_PNG));
    const blob = getRenderedBlob(file.storageKey);
    expect(blob?.bytes).toEqual(TINY_PNG);
    const dims = readPngDimensions(blob!.bytes);
    expect(dims).toEqual({ width: 1, height: 1 });
    expect(getRenderedFile(file.fileId)?.artifactVersion).toBe(1);

    const again = await renderApprovedOutput();
    // Separate artifact — different renderKey identity, same checksum of bytes
    expect(again.file.checksum).toBe(file.checksum);
  });

  it("D — UNSUPPORTED representation (gif/svg/mp4/pdf)", () => {
    expect(() =>
      resolveRenderer({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "svg",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(() =>
      resolveRenderer({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "mp4",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(() =>
      resolveRenderer({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "pdf",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(() =>
      resolveRenderer({
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        // gif not in CdfRenderFormat — cast proves unsupported matrix
        format: "gif" as never,
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(
      socialMediaUnsupportedFormatMessage(
        SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        "gif",
      ),
    ).toMatch(/GIF|unsupported/i);
    expect(
      socialMediaUnsupportedFormatMessage(
        SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        "png",
      ),
    ).toMatch(/no file representation/i);
  });

  it("F/G — Vault asset ok; missing Vault asset typed", async () => {
    const { file } = await renderApprovedOutput();
    expect(file.checksum).toBe(sha256Hex(TINY_PNG));

    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
        {
          previewAssetRef: {
            vaultAssetId: "507f1f77bcf86cd7994390aa",
            role: "creative_preview",
          },
          sourceRefs: {
            executionId: "exec_missing",
            upstreamArtifactRefs: [
              {
                artifactId: routes.artifact.artifactId,
                version: 1,
                artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
              },
            ],
            vaultAssetIds: ["507f1f77bcf86cd7994390aa"],
          },
        },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);
    await expect(
      renderArtifact(
        {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "final",
          organizationId: "org_m9e",
          projectId: "proj_m9e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/ASSET_NOT_FOUND|not found|missing/i);
  });

  it("K — IDEMPOTENT same renderKey / file / checksum", async () => {
    const { out, file } = await renderApprovedOutput({ purpose: "preview" });
    const again = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "preview",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );
    expect(again.fileId).toBe(file.fileId);
    expect(again.renderKey).toBe(file.renderKey);
    expect(again.checksum).toBe(file.checksum);
  });

  it("M — IMMUTABILITY: ArtifactVersion unchanged after render", async () => {
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);
    const before = structuredClone(
      getArtifactVersion(out.artifact.artifactId, 1).data,
    );
    await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );
    expect(getArtifactVersion(out.artifact.artifactId, 1).data).toEqual(before);
  });

  it("N — TENANCY: wrong project / cross-tenant upstream refused", async () => {
    const sessionA = startSession("org_a", "proj_a");
    const upA = seedUpstream(sessionA.sessionId, "org_a", "proj_a");
    const sessionB = startSession("org_b", "proj_b");
    const outB = createArtifact({
      organizationId: "org_b",
      projectId: "proj_b",
      sessionId: sessionB.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        upA.routes.artifact.artifactId,
        upA.platform.artifact.artifactId,
        upA.size.artifact.artifactId,
      ) as never,
    });
    markValidated(outB.artifact.artifactId, 1);
    markApproved(outB.artifact.artifactId, 1);
    await expect(
      renderArtifact(
        {
          artifactId: outB.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "final",
          organizationId: "org_b",
          projectId: "proj_b",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/OWNERSHIP|Cross-tenant|not found|ARTIFACT/i);

    const { out } = await renderApprovedOutput();
    await expect(
      renderArtifact(
        {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "final",
          organizationId: "org_m9e",
          projectId: "wrong_proj",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/OWNERSHIP|not found|ARTIFACT/i);
  });

  it("O/P — LIFECYCLE gate; preview vs final", async () => {
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
      ) as never,
    });

    await expect(
      renderArtifact(
        {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "final",
          organizationId: "org_m9e",
          projectId: "proj_m9e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/LIFECYCLE|not allowed/i);

    markValidated(out.artifact.artifactId, 1);
    const preview = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "preview",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );
    expect(preview.purpose).toBe("preview");
    expect(preview.artifactVersion).toBe(1);

    markApproved(out.artifact.artifactId, 1);
    const fin = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );
    expect(fin.purpose).toBe("final");
    expect(fin.checksum).toBe(preview.checksum);

    const rejected = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
      ) as never,
    });
    markValidated(rejected.artifact.artifactId, 1);
    markRejected(rejected.artifact.artifactId, 1);
    await expect(
      renderArtifact(
        {
          artifactId: rejected.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "preview",
          organizationId: "org_m9e",
          projectId: "proj_m9e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/LIFECYCLE|not allowed/i);
  });

  it("Q/R — AI + legacy isolation (mocks throw if invoked)", async () => {
    await renderApprovedOutput();
    expect(getMediaSpy).not.toHaveBeenCalled();
    expect(materializeSyncImageArtifacts).not.toHaveBeenCalled();
  });

  it("S/T — unsupported layout / missing previewAssetRef; art_* rejected", () => {
    expect(() =>
      selectSocialMediaPreviewVaultId({
        previewAssetRef: { vaultAssetId: "art_legacy_1" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectSocialMediaPreviewVaultId({
        previewAssetRef: { vaultAssetId: "exec_abc" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectSocialMediaPreviewVaultId({
        previewAssetRef: { vaultAssetId: "cdfart_x_out" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectSocialMediaPreviewVaultId({
        previewAssetRef: { vaultAssetId: "https://cdn.example/x.png" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() => selectSocialMediaPreviewVaultId({})).toThrow(
      /ARTIFACT_NOT_RENDERABLE|previewAssetRef/i,
    );
  });

  it("S — canvas/PNG dimension mismatch refuses silent resize", async () => {
    await expect(
      renderApprovedOutput({
        dataOverrides: {
          canvas: {
            widthPx: 1080,
            heightPx: 1080,
            coordinateSystem: "social_pixel",
            source: "platform_default",
            elementLayoutUnresolved: true,
          },
        },
      }),
    ).rejects.toThrow(/do not match|ARTIFACT_NOT_RENDERABLE|resize/i);
  });

  it("U/V/W — no session generated/selected/approved mutation", async () => {
    const session = startSession();
    // Allow fire-and-forget brief persist to settle so it cannot overwrite a later bind.
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9e",
      projectId: "proj_m9e",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);

    const bound = bindGeneratedSocialMediaArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactId: out.artifact.artifactId,
      version: 1,
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    if (!bound.ok || !bound.session) {
      throw new Error(`bind: ${"message" in bound ? bound.message : "fail"}`);
    }
    const liveAfterBind = getCdfSession(session.sessionId)!;
    expect(liveAfterBind.generatedArtifacts ?? []).toHaveLength(1);
    const snapGen = structuredClone(liveAfterBind.generatedArtifacts ?? []);
    const snapSel = structuredClone(liveAfterBind.selectedArtifacts ?? []);
    const snapApr = structuredClone(liveAfterBind.approvedArtifacts ?? []);
    const snapVer = liveAfterBind.sessionVersion;

    await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_m9e",
        projectId: "proj_m9e",
      },
      { vaultAssetResolver: vault() },
    );

    const after = getCdfSession(session.sessionId)!;
    expect(after.generatedArtifacts ?? []).toEqual(snapGen);
    expect(after.selectedArtifacts ?? []).toEqual(snapSel);
    expect(after.approvedArtifacts ?? []).toEqual(snapApr);
    expect(after.sessionVersion).toBe(snapVer);
  });

  it("JPG pass-through; missing artifact; upstream assert", async () => {
    const { file } = await renderApprovedOutput({
      format: "jpg",
      bytes: TINY_JPEG,
      dataOverrides: {
        // JPG has no IHDR check — canvas may stay 1×1 without mismatch gate
      },
    });
    expect(file.mimeType).toBe("image/jpeg");

    await expect(
      renderArtifact(
        {
          artifactId: "cdfart_missing_social_output",
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          format: "png",
          purpose: "final",
          organizationId: "org_m9e",
          projectId: "proj_m9e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/ARTIFACT_NOT_FOUND|not found/i);

    expect(() =>
      assertSocialMediaUpstreamExactRefs(
        SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        {},
        { organizationId: "org_m9e", projectId: "proj_m9e" },
      ),
    ).toThrow(/missing exact upstream|routesRef/i);
  });
});
