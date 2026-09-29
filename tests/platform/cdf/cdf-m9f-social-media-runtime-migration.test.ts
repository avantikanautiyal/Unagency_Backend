/**
 * CDF M9F — Social Media runtime strangler (canonical download eligibility).
 */

jest.mock("../../../src/platform/api/services/sync-image-artifact-materializer", () => ({
  materializeSyncImageArtifacts: jest.fn(async () => {
    throw new Error("AI/legacy isolation: sync-image must not run during M9F canonical download");
  }),
}));

import {
  applyCdfTransition,
  bindGeneratedSocialMediaArtifactToSession,
  createArtifact,
  createMemoryVaultAssetResolver,
  createVersion,
  evaluateSocialMediaDownloadEligibility,
  fixtureSocialMediaOutput,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaSizeReference,
  getArtifactVersion,
  getCdfSession,
  getRenderedBlob,
  isSocialMediaCanonicalDownloadEnabled,
  markApproved,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveSocialMediaCanonicalDownload,
  sha256Hex,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_FIXTURE_IDS,
  SOCIAL_MEDIA_RENDER_CONTRACT,
} from "../../../src/platform/cdf";
import { materializeSyncImageArtifacts } from "../../../src/platform/api/services/sync-image-artifact-materializer";
import { ProductAssetService } from "../../../src/services/product-asset-service";

const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("CDF M9F Social Media Runtime Download Strangler", () => {
  const prevDownload = process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD;
  const prevForce = process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD;
  let getMediaSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD;
    delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD;
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
        throw new Error("Legacy isolation: getMedia must not run on canonical path");
      });
  });

  afterEach(() => {
    getMediaSpy.mockRestore();
    if (prevDownload === undefined) {
      delete process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD;
    } else {
      process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = prevDownload;
    }
    if (prevForce === undefined) {
      delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD;
    } else {
      process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD = prevForce;
    }
  });

  function startSession(org = "org_m9f", proj = "proj_m9f") {
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
      brief: "M9F social",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function seedUpstream(sessionId: string, org = "org_m9f", proj = "proj_m9f") {
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
      canvas: { ...base.canvas, widthPx: 1, heightPx: 1 },
      ...overrides,
    };
  }

  function vault() {
    return createMemoryVaultAssetResolver({
      [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage]: TINY_PNG,
    });
  }

  it("A/K — canonical download always on; FORCE_LEGACY kill-switch eradicated", () => {
    delete process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD;
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "0";
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
    // Eradicated: FORCE_LEGACY_DOWNLOAD must not re-disable canonical download.
    process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD = "1";
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
    expect(SOCIAL_MEDIA_RENDER_CONTRACT.neverSilentLegacyFallback).toBe(true);
    expect(
      SOCIAL_MEDIA_RENDER_CONTRACT.finalActionMapping.download.status,
    ).toBe("canonical_default");
    expect(
      SOCIAL_MEDIA_RENDER_CONTRACT.finalActionMapping.create_another_size
        .status,
    ).toBe("not_a_renderer");
    expect(
      SOCIAL_MEDIA_RENDER_CONTRACT.finalActionMapping.request_adaptation.status,
    ).toBe("not_a_renderer");
    expect(
      (SOCIAL_MEDIA_RENDER_CONTRACT.stranglerFlags as Record<string, string>)
        .forceLegacyDownload,
    ).toBeUndefined();
  });

  it("B/S — ELIGIBILITY: adaptation CTAs not downloads; path audit", () => {
    expect(
      evaluateSocialMediaDownloadEligibility({
        label: "Create Another Size",
        canonicalDownloadEnabled: true,
        pin: {
          artifactId: "cdfart_x",
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        },
      }).decision,
    ).toBe("not_a_download");
    expect(
      evaluateSocialMediaDownloadEligibility({
        label: "Request Adaptation",
        canonicalDownloadEnabled: true,
        pin: {
          artifactId: "cdfart_x",
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        },
      }).decision,
    ).toBe("not_a_download");
  });

  it("B/F — no pin → no_canonical_artifact (fail closed, no art_*)", () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const e = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "png",
    });
    expect(e.decision).toBe("no_canonical_artifact");
    if (e.decision === "no_canonical_artifact") {
      expect(e.silentLegacyFallbackForbidden).toBe(true);
    }
  });

  it("G — unsupported format with pin → NO silent legacy", () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const e = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "gif",
      pin: {
        artifactId: "cdfart_sm_1",
        artifactVersion: 2,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
        lifecycleStatus: "approved",
      },
    });
    expect(e.decision).toBe("unsupported_representation");
    if (e.decision === "unsupported_representation") {
      expect(e.silentLegacyFallbackForbidden).toBe(true);
    }
  });

  it("E — generated/selected-only → lifecycle_blocked (no art_*)", () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const e = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "png",
      pin: {
        artifactId: "cdfart_sm_1",
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
        lifecycleStatus: "validated",
      },
    });
    expect(e.decision).toBe("lifecycle_blocked");
    if (e.decision === "lifecycle_blocked") {
      expect(e.silentLegacyFallbackForbidden).toBe(true);
    }
  });

  it("C/D/Q/R — CANONICAL SUCCESS: exact approved version → RenderedFile; no getMedia", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
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

    const result = await resolveSocialMediaCanonicalDownload({
      label: "Download",
      format: "png",
      pin: {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      organizationId: "org_m9f",
      projectId: "proj_m9f",
      deps: { vaultAssetResolver: vault() },
    });

    expect(result.kind).toBe("rendered");
    if (result.kind === "rendered") {
      expect(result.file.artifactVersion).toBe(1);
      expect(result.file.mimeType).toBe("image/png");
      expect(result.file.checksum).toBe(sha256Hex(TINY_PNG));
      expect(result.file.fileId.startsWith("cdfrndf_")).toBe(true);
      expect(result.downloadPath).toBe(
        `/v1/cdf/rendered-files/${result.file.fileId}/content`,
      );
      expect(getRenderedBlob(result.file.storageKey)?.bytes).toEqual(TINY_PNG);
    }
    expect(getMediaSpy).not.toHaveBeenCalled();
    expect(materializeSyncImageArtifacts).not.toHaveBeenCalled();
  });

  it("D — EXACT VERSION: v3 pin ignores later v4 HEAD", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
        { compositionNotes: "v1" },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);

    createVersion({
      artifactId: out.artifact.artifactId,
      expectedLatestVersion: 1,
      data: outputData(
        routes.artifact.artifactId,
        platform.artifact.artifactId,
        size.artifact.artifactId,
        { compositionNotes: "v2-head" },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 2);
    markApproved(out.artifact.artifactId, 2);

    const result = await resolveSocialMediaCanonicalDownload({
      label: "Download",
      format: "png",
      pin: {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      organizationId: "org_m9f",
      projectId: "proj_m9f",
      deps: { vaultAssetResolver: vault() },
    });
    expect(result.kind).toBe("rendered");
    if (result.kind === "rendered") {
      expect(result.file.artifactVersion).toBe(1);
    }
  });

  it("H — render failure does not call getMedia (no catch→legacy)", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
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
            vaultAssetId: "507f1f77bcf86cd7994390bb",
            role: "creative_preview",
          },
          sourceRefs: {
            executionId: "exec_fail",
            upstreamArtifactRefs: [
              {
                artifactId: routes.artifact.artifactId,
                version: 1,
                artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
              },
            ],
            vaultAssetIds: ["507f1f77bcf86cd7994390bb"],
          },
        },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);

    await expect(
      resolveSocialMediaCanonicalDownload({
        label: "Download",
        format: "png",
        pin: {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          validationStatus: "passed",
          runtimePath: "canonical",
        },
        organizationId: "org_m9f",
        projectId: "proj_m9f",
        deps: { vaultAssetResolver: vault() },
      }),
    ).rejects.toThrow(/ASSET_NOT_FOUND|not found/i);
    expect(getMediaSpy).not.toHaveBeenCalled();
  });

  it("I — missing Vault asset → typed failure; no getMedia", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const missingId = "507f1f77bcf86cd7994390cc";
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
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
            vaultAssetId: missingId,
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
            vaultAssetIds: [missingId],
          },
        },
      ) as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);
    await expect(
      resolveSocialMediaCanonicalDownload({
        label: "Download",
        format: "png",
        pin: {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          validationStatus: "passed",
          runtimePath: "canonical",
        },
        organizationId: "org_m9f",
        projectId: "proj_m9f",
        deps: { vaultAssetResolver: vault() },
      }),
    ).rejects.toThrow(/ASSET_NOT_FOUND|not found/i);
    expect(getMediaSpy).not.toHaveBeenCalled();
  });

  it("J — FORCE_LEGACY_DOWNLOAD env is ignored (eradicated)", () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_DOWNLOAD = "1";
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
  });

  it("K — download env flag eradicated: pin always requires canonical (never art_* rollback)", async () => {
    const result = await resolveSocialMediaCanonicalDownload({
      label: "Download",
      format: "png",
      pin: {
        artifactId: "cdfart_sm_legacy",
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      canonicalDownloadEnabled: false,
    });
    // Flag off is obsolete — missing Vault/render may not_canonical, but
    // eligibility must NOT be legacy_only (art_* rollback eradicated).
    if (result.kind === "not_canonical") {
      expect(result.eligibility.decision).not.toBe("legacy_only");
      expect(
        "silentLegacyFallbackForbidden" in result.eligibility
          ? (result.eligibility as { silentLegacyFallbackForbidden?: boolean })
              .silentLegacyFallbackForbidden
          : true,
      ).toBeTruthy();
    }
  });

  it("L/M — session + artifact immutability on canonical download", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
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
    bindGeneratedSocialMediaArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactId: out.artifact.artifactId,
      version: 1,
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    const live = getCdfSession(session.sessionId)!;
    const snapGen = structuredClone(live.generatedArtifacts ?? []);
    const snapSel = structuredClone(live.selectedArtifacts ?? []);
    const snapApr = structuredClone(live.approvedArtifacts ?? []);
    const snapVer = live.sessionVersion;
    const beforeData = structuredClone(
      getArtifactVersion(out.artifact.artifactId, 1).data,
    );

    await resolveSocialMediaCanonicalDownload({
      label: "Download",
      format: "png",
      pin: {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      organizationId: "org_m9f",
      projectId: "proj_m9f",
      deps: { vaultAssetResolver: vault() },
    });

    const after = getCdfSession(session.sessionId)!;
    expect(after.generatedArtifacts ?? []).toEqual(snapGen);
    expect(after.selectedArtifacts ?? []).toEqual(snapSel);
    expect(after.approvedArtifacts ?? []).toEqual(snapApr);
    expect(after.sessionVersion).toBe(snapVer);
    expect(getArtifactVersion(out.artifact.artifactId, 1).data).toEqual(
      beforeData,
    );
  });

  it("N — TENANCY: wrong project refused", async () => {
    process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const { platform, size, routes } = seedUpstream(session.sessionId);
    const out = createArtifact({
      organizationId: "org_m9f",
      projectId: "proj_m9f",
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

    await expect(
      resolveSocialMediaCanonicalDownload({
        label: "Download",
        format: "png",
        pin: {
          artifactId: out.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          validationStatus: "passed",
          runtimePath: "canonical",
        },
        organizationId: "org_m9f",
        projectId: "wrong_proj",
        deps: { vaultAssetResolver: vault() },
      }),
    ).rejects.toThrow(/OWNERSHIP|not found|ARTIFACT/i);
  });

  it("T — observability: missing pin fails closed (no art_* legacy_only)", () => {
    const e = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "png",
      canonicalDownloadEnabled: false,
    });
    expect(e.decision).not.toBe("legacy_only");
    expect(
      e.decision === "unsupported_representation" ||
        e.decision === "no_canonical_artifact",
    ).toBe(true);
    expect(e.reason).toMatch(/art_\*|canonical|refusing/i);
  });
});
