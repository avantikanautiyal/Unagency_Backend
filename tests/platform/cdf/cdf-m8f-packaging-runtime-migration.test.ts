/**
 * CDF M8F — Packaging runtime strangler (canonical download eligibility).
 */

import {
  applyCdfTransition,
  createArtifact,
  createMemoryVaultAssetResolver,
  evaluatePackagingDownloadEligibility,
  fixturePackaging3dDirection,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  isPackagingCanonicalDownloadEnabled,
  markApproved,
  markValidated,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_FIXTURE_IDS,
  PACKAGING_RENDER_CONTRACT,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolvePackagingCanonicalDownload,
} from "../../../src/platform/cdf";

const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("CDF M8F Packaging Runtime Download Strangler", () => {
  const prevDownload = process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD;
  const prevForce = process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD;

  beforeEach(() => {
    delete process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD;
    delete process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD;
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests({
      registerFixtureRenderer: false,
      registerPresentationRenderers: true,
      registerPackagingRenderers: true,
    });
  });

  afterEach(() => {
    if (prevDownload === undefined) {
      delete process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD;
    } else {
      process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = prevDownload;
    }
    if (prevForce === undefined) {
      delete process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD;
    } else {
      process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD = prevForce;
    }
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_m8f",
      projectId: "proj_m8f",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "M8F pack",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  it("FLAG — canonical download always on; FORCE_LEGACY kill-switch eradicated", () => {
    delete process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD;
    expect(isPackagingCanonicalDownloadEnabled()).toBe(true);
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "0";
    expect(isPackagingCanonicalDownloadEnabled()).toBe(true);
    process.env.CDF_PACKAGING_FORCE_LEGACY_DOWNLOAD = "1";
    expect(isPackagingCanonicalDownloadEnabled()).toBe(true);
    expect(PACKAGING_RENDER_CONTRACT.neverSilentLegacyFallback).toBe(true);
    expect(
      PACKAGING_RENDER_CONTRACT.finalActionMapping.download_packaging_files
        .status,
    ).toBe("canonical_default");
    expect(
      PACKAGING_RENDER_CONTRACT.finalActionMapping.create_another_sku.status,
    ).toBe("not_a_renderer");
    expect(
      (PACKAGING_RENDER_CONTRACT.stranglerFlags as Record<string, string>)
        .forceLegacyDownload,
    ).toBeUndefined();
  });

  it("ELIGIBILITY — Create Another SKU is not a download", () => {
    const e = evaluatePackagingDownloadEligibility({
      label: "Create Another SKU",
      canonicalDownloadEnabled: true,
      pin: {
        artifactId: "cdfart_x",
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      },
    });
    expect(e.decision).toBe("not_a_download");
  });

  it("ELIGIBILITY — no pin → no_canonical_artifact (fail closed, no art_*)", () => {
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "1";
    const e = evaluatePackagingDownloadEligibility({
      label: "Download Packaging Files",
      format: "png",
    });
    expect(e.decision).toBe("no_canonical_artifact");
    if (e.decision === "no_canonical_artifact") {
      expect(e.silentLegacyFallbackForbidden).toBe(true);
    }
  });

  it("ELIGIBILITY — unsupported format with pin → NO silent legacy", () => {
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "1";
    const e = evaluatePackagingDownloadEligibility({
      label: "Download Packaging Files",
      format: "zip",
      pin: {
        artifactId: "cdfart_pack_1",
        artifactVersion: 2,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
    });
    expect(e.decision).toBe("unsupported_representation");
    if (e.decision === "unsupported_representation") {
      expect(e.silentLegacyFallbackForbidden).toBe(true);
    }
  });

  it("ELIGIBILITY — missing exact version with pin → unsupported (not latest)", () => {
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "1";
    const e = evaluatePackagingDownloadEligibility({
      label: "Download 3D Mockups",
      format: "png",
      pin: {
        artifactId: "cdfart_pack_1",
        artifactVersion: Number.NaN,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
    });
    expect(e.decision).toBe("unsupported_representation");
  });

  it("CANONICAL DOWNLOAD — exact version → RenderedFile content path", async () => {
    process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD = "1";
    const session = startSession();
    const dieline = createArtifact({
      organizationId: "org_m8f",
      projectId: "proj_m8f",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const routes = createArtifact({
      organizationId: "org_m8f",
      projectId: "proj_m8f",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(
        dieline.artifact.artifactId,
        1,
      ) as never,
    });
    const threeD = createArtifact({
      organizationId: "org_m8f",
      projectId: "proj_m8f",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
      }) as never,
    });
    const front = createArtifact({
      organizationId: "org_m8f",
      projectId: "proj_m8f",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      artifactType: "pack",
      data: fixturePackagingFrontPack({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
        threeDArtifactId: threeD.artifact.artifactId,
      }) as never,
    });
    markValidated(front.artifact.artifactId, 1);
    markApproved(front.artifact.artifactId, 1);

    const result = await resolvePackagingCanonicalDownload({
      label: "Download Packaging Files",
      format: "png",
      pin: {
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      organizationId: "org_m8f",
      projectId: "proj_m8f",
      deps: {
        vaultAssetResolver: createMemoryVaultAssetResolver({
          [PACKAGING_FIXTURE_IDS.vaultImage]: TINY_PNG,
          [PACKAGING_FIXTURE_IDS.vaultDieline]: TINY_PNG,
        }),
      },
    });

    expect(result.kind).toBe("rendered");
    if (result.kind === "rendered") {
      expect(result.file.artifactId).toBe(front.artifact.artifactId);
      expect(result.file.artifactVersion).toBe(1);
      expect(result.downloadPath).toBe(
        `/v1/cdf/rendered-files/${result.file.fileId}/content`,
      );
      expect(result.eligibility.format).toBe("png");
    }
  });

  it("STRANGLER — download env flag eradicated: never legacy_only art_* rollback", async () => {
    const result = await resolvePackagingCanonicalDownload({
      label: "Download Packaging Files",
      format: "png",
      pin: {
        artifactId: "cdfart_pack_legacy",
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        validationStatus: "passed",
        runtimePath: "canonical",
      },
      canonicalDownloadEnabled: false,
    });
    if (result.kind === "not_canonical") {
      expect(result.eligibility.decision).not.toBe("legacy_only");
    }
  });
});
