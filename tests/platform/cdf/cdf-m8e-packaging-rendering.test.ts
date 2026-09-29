/**
 * CDF M8E — Packaging representation / rendering (M5 integration).
 */

import {
  applyCdfTransition,
  assertPackagingUpstreamExactRefs,
  computeRenderKey,
  createArtifact,
  createMemoryVaultAssetResolver,
  createVersion,
  CdfRenderError,
  fixturePackaging3dDirection,
  fixturePackagingCompletePack,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  fixturePackagingSkuAdaptations,
  fixturePackagingViews,
  getArtifactVersion,
  getRenderedBlob,
  getRenderedFile,
  hasRendererCapability,
  listRegisteredRenderers,
  markApproved,
  markRejected,
  markValidated,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_CONFIRMED_REPRESENTATIONS,
  PACKAGING_FIXTURE_IDS,
  PACKAGING_PREVIEW_RASTER_RENDERER_ID,
  PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
  PACKAGING_RENDER_CONTRACT,
  PACKAGING_UNRESOLVED_REPRESENTATIONS,
  packagingUnsupportedFormatMessage,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveRenderer,
  selectPackagingPreviewVaultId,
  sha256Hex,
} from "../../../src/platform/cdf";

/** Minimal PNG signature + payload for deterministic checksum tests. */
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

describe("CDF M8E Packaging Rendering", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests({
      registerFixtureRenderer: false,
      registerPresentationRenderers: true,
      registerPackagingRenderers: true,
    });
  });

  function startSession(org = "org_m8e", proj = "proj_m8e") {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: org,
      projectId: proj,
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Mango drink pack",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function vault(bytes: Uint8Array = TINY_PNG) {
    return createMemoryVaultAssetResolver({
      [PACKAGING_FIXTURE_IDS.vaultImage]: bytes,
      [PACKAGING_FIXTURE_IDS.vaultDieline]: bytes,
    });
  }

  function seedUpstream(sessionId: string) {
    const dieline = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const routes = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId,
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
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
      }) as never,
    });
    return { dieline, routes, threeD };
  }

  async function renderApprovedFront(opts?: {
    version?: number;
    format?: "png" | "jpg";
    purpose?: "preview" | "final";
    bytes?: Uint8Array;
  }) {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    const front = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
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
    const file = await renderArtifact(
      {
        artifactId: front.artifact.artifactId,
        artifactVersion: opts?.version ?? 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: opts?.format ?? "png",
        purpose: opts?.purpose ?? "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
      },
      { vaultAssetResolver: vault(opts?.bytes ?? TINY_PNG) },
    );
    return { front, file, session };
  }

  it("REGISTRY — packaging-preview-raster registered; unsupported formats typed", () => {
    expect(
      hasRendererCapability({
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "png",
        purpose: "final",
      }),
    ).toBe(true);
    expect(
      listRegisteredRenderers().some(
        (r) => r.rendererId === PACKAGING_PREVIEW_RASTER_RENDERER_ID,
      ),
    ).toBe(true);
    expect(() =>
      resolveRenderer({
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "svg",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(() =>
      resolveRenderer({
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        format: "pdf",
        purpose: "final",
      }),
    ).toThrow(/RENDER_FORMAT_UNSUPPORTED|unsupported/i);
    expect(
      packagingUnsupportedFormatMessage(
        PACKAGING_ARTIFACT_KEYS.dieline,
        "svg",
      ),
    ).toMatch(/geometry|unresolved/i);
    expect(PACKAGING_RENDER_CONTRACT.neverSilentLegacyFallback).toBe(true);
    expect(PACKAGING_CONFIRMED_REPRESENTATIONS.length).toBe(2);
    expect(
      PACKAGING_UNRESOLVED_REPRESENTATIONS.some((u) => u.format === "glb"),
    ).toBe(true);
  });

  it("EXACT VERSION — v1 render ignores later v2; source immutable", async () => {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    const front = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
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

    const v1 = await renderArtifact(
      {
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
      },
      { vaultAssetResolver: vault(TINY_PNG) },
    );

    createVersion({
      artifactId: front.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixturePackagingFrontPack({
          dielineArtifactId: dieline.artifact.artifactId,
          routesArtifactId: routes.artifact.artifactId,
          threeDArtifactId: threeD.artifact.artifactId,
        }),
        compositionNotes: "v2 must not affect v1 render",
      } as never,
    });

    const again = await renderArtifact(
      {
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
      },
      { vaultAssetResolver: vault(TINY_PNG) },
    );

    expect(again.fileId).toBe(v1.fileId);
    expect(again.artifactVersion).toBe(1);
    expect(again.checksum).toBe(v1.checksum);
    expect(getArtifactVersion(front.artifact.artifactId, 1).data).toMatchObject({
      compositionNotes: "Centered brand lockup over fruit hero",
    });
  });

  it("LIFECYCLE — rejected blocked; validated preview ok; final needs approved", async () => {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    const front = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
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

    await expect(
      renderArtifact(
        {
          artifactId: front.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
          format: "png",
          purpose: "final",
          organizationId: "org_m8e",
          projectId: "proj_m8e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/LIFECYCLE|not allowed/i);

    markValidated(front.artifact.artifactId, 1);
    const preview = await renderArtifact(
      {
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "png",
        purpose: "preview",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
      },
      { vaultAssetResolver: vault() },
    );
    expect(preview.purpose).toBe("preview");

    markRejected(front.artifact.artifactId, 1);
    await expect(
      renderArtifact(
        {
          artifactId: front.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
          format: "png",
          purpose: "preview",
          organizationId: "org_m8e",
          projectId: "proj_m8e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/LIFECYCLE|not allowed/i);
  });

  it("FRONT-PACK — deterministic PNG; MIME; checksum; renderer version; idempotent", async () => {
    const { file } = await renderApprovedFront();
    expect(file.rendererId).toBe(PACKAGING_PREVIEW_RASTER_RENDERER_ID);
    expect(file.rendererVersion).toBe(
      PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
    );
    expect(file.mimeType).toBe("image/png");
    expect(file.format).toBe("png");
    expect(file.checksum).toBe(sha256Hex(TINY_PNG));
    const blob = getRenderedBlob(file.storageKey);
    expect(blob?.bytes).toEqual(TINY_PNG);
    expect(blob?.bytes[0]).toBe(0x89);

    const key = computeRenderKey({
      artifactId: file.artifactId,
      artifactVersion: file.artifactVersion,
      format: "png",
      purpose: "final",
      rendererId: file.rendererId,
      rendererVersion: file.rendererVersion,
      optionsHash: file.renderOptionsHash,
    });
    expect(file.renderKey).toBe(key);
    expect(getRenderedFile(file.fileId)?.fileId).toBe(file.fileId);
  });

  it("JPG pass-through detects JPEG magic", async () => {
    const { file } = await renderApprovedFront({
      format: "jpg",
      bytes: TINY_JPEG,
    });
    expect(file.mimeType).toBe("image/jpeg");
    expect(getRenderedBlob(file.storageKey)?.bytes[0]).toBe(0xff);
  });

  it("ASSETS — art_/exec_/cdfart_/URL rejected at preview selection", () => {
    expect(() =>
      selectPackagingPreviewVaultId({
        previewAssetRef: { vaultAssetId: "art_legacy_1" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectPackagingPreviewVaultId({
        previewAssetRef: { vaultAssetId: "exec_abc" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectPackagingPreviewVaultId({
        previewAssetRef: { vaultAssetId: "cdfart_x_front" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
    expect(() =>
      selectPackagingPreviewVaultId({
        previewAssetRef: { vaultAssetId: "https://cdn.example/x.png" },
      }),
    ).toThrow(/ASSET_NOT_FOUND|rejected|Vault/i);
  });

  it("DIELINE — geometry render unsupported; no fabrication", () => {
    expect(() =>
      resolveRenderer({
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        format: "svg",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    expect(() =>
      resolveRenderer({
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        format: "png",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
  });

  it("3D — raster preview ok; no GLB/scene fabrication", async () => {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    markValidated(threeD.artifact.artifactId, 1);
    markApproved(threeD.artifact.artifactId, 1);
    const file = await renderArtifact(
      {
        artifactId: threeD.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
        options: { extras: { candidateId: "direction_01" } },
      },
      { vaultAssetResolver: vault() },
    );
    expect(file.checksum).toBe(sha256Hex(TINY_PNG));
    expect(() =>
      resolveRenderer({
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        format: "svg",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    void dieline;
    void routes;
  });

  it("COMPLETE-PACK — exact deps; missing upstream; no preview → not renderable", async () => {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    const front = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
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

    const complete = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
      artifactType: "pack",
      data: fixturePackagingCompletePack({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
        threeDArtifactId: threeD.artifact.artifactId,
        frontArtifactId: front.artifact.artifactId,
      }) as never,
    });
    markValidated(complete.artifact.artifactId, 1);
    markApproved(complete.artifact.artifactId, 1);

    await expect(
      renderArtifact(
        {
          artifactId: complete.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
          format: "png",
          purpose: "final",
          organizationId: "org_m8e",
          projectId: "proj_m8e",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/ARTIFACT_NOT_RENDERABLE|previewAssetRef/i);

    // With surface preview + entityId
    createVersion({
      artifactId: complete.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixturePackagingCompletePack({
          dielineArtifactId: dieline.artifact.artifactId,
          routesArtifactId: routes.artifact.artifactId,
          threeDArtifactId: threeD.artifact.artifactId,
          frontArtifactId: front.artifact.artifactId,
        }),
        surfaces: [
          {
            id: "package_surface_front",
            role: "front",
            previewAssetRef: {
              vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
            },
          },
          { id: "package_surface_back", role: "back" },
        ],
      } as never,
    });
    markValidated(complete.artifact.artifactId, 2);
    markApproved(complete.artifact.artifactId, 2);
    const ok = await renderArtifact(
      {
        artifactId: complete.artifact.artifactId,
        artifactVersion: 2,
        artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
        options: { extras: { entityId: "package_surface_front" } },
      },
      { vaultAssetResolver: vault() },
    );
    expect(ok.artifactVersion).toBe(2);

    // Missing upstream
    const orphan = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
      artifactType: "pack",
      data: {
        ...fixturePackagingCompletePack(),
        dielineRef: {
          artifactId: "cdfart_missing_dieline",
          version: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        },
        surfaces: [
          {
            id: "package_surface_front",
            role: "front",
            previewAssetRef: {
              vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
            },
          },
        ],
      } as never,
    });
    markValidated(orphan.artifact.artifactId, 1);
    markApproved(orphan.artifact.artifactId, 1);
    await expect(
      renderArtifact(
        {
          artifactId: orphan.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
          format: "png",
          purpose: "final",
          organizationId: "org_m8e",
          projectId: "proj_m8e",
          options: { extras: { entityId: "package_surface_front" } },
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/not found|ARTIFACT/i);
  });

  it("VIEWS / SKU — exact deps; entity selection; no invented camera", async () => {
    const session = startSession();
    const { dieline, routes, threeD } = seedUpstream(session.sessionId);
    const front = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
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
    const complete = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
      artifactType: "pack",
      data: fixturePackagingCompletePack({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
        threeDArtifactId: threeD.artifact.artifactId,
        frontArtifactId: front.artifact.artifactId,
      }) as never,
    });
    const views = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "views",
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
      artifactType: "pack",
      data: fixturePackagingViews(complete.artifact.artifactId, 1) as never,
    });
    markValidated(views.artifact.artifactId, 1);
    markApproved(views.artifact.artifactId, 1);
    const viewFile = await renderArtifact(
      {
        artifactId: views.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.views,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
        options: { extras: { viewId: "view_01" } },
      },
      { vaultAssetResolver: vault() },
    );
    expect(viewFile.artifactKey).toBe(PACKAGING_ARTIFACT_KEYS.views);

    const skus = createArtifact({
      organizationId: "org_m8e",
      projectId: "proj_m8e",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "sku-adaptations",
      artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      artifactType: "pack",
      data: {
        ...fixturePackagingSkuAdaptations({
          viewsArtifactId: views.artifact.artifactId,
          completePackArtifactId: complete.artifact.artifactId,
        }),
        skus: [
          {
            id: "sku_01",
            label: "Masala Mango 250ml",
            previewAssetRef: {
              vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
            },
          },
        ],
      } as never,
    });
    markValidated(skus.artifact.artifactId, 1);
    markApproved(skus.artifact.artifactId, 1);
    const skuFile = await renderArtifact(
      {
        artifactId: skus.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
        format: "png",
        purpose: "final",
        organizationId: "org_m8e",
        projectId: "proj_m8e",
        options: { extras: { skuId: "sku_01" } },
      },
      { vaultAssetResolver: vault() },
    );
    expect(skuFile.artifactVersion).toBe(1);
  });

  it("TENANCY — cross-tenant dependency refused", async () => {
    const sessionA = startSession("org_a", "proj_a");
    const sessionB = startSession("org_b", "proj_b");
    const upA = (() => {
      const dieline = createArtifact({
        organizationId: "org_a",
        projectId: "proj_a",
        sessionId: sessionA.sessionId,
        serviceId: "packaging",
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        artifactType: "config_choice",
        data: fixturePackagingDieline() as never,
      });
      const routes = createArtifact({
        organizationId: "org_a",
        projectId: "proj_a",
        sessionId: sessionA.sessionId,
        serviceId: "packaging",
        phaseId: "routes",
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixturePackagingRoutes(dieline.artifact.artifactId, 1) as never,
      });
      const threeD = createArtifact({
        organizationId: "org_a",
        projectId: "proj_a",
        sessionId: sessionA.sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        artifactType: "pack",
        data: fixturePackaging3dDirection({
          dielineArtifactId: dieline.artifact.artifactId,
          routesArtifactId: routes.artifact.artifactId,
        }) as never,
      });
      return { dieline, routes, threeD };
    })();

    const frontB = createArtifact({
      organizationId: "org_b",
      projectId: "proj_b",
      sessionId: sessionB.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      artifactType: "pack",
      data: fixturePackagingFrontPack({
        dielineArtifactId: upA.dieline.artifact.artifactId,
        routesArtifactId: upA.routes.artifact.artifactId,
        threeDArtifactId: upA.threeD.artifact.artifactId,
      }) as never,
    });
    markValidated(frontB.artifact.artifactId, 1);
    markApproved(frontB.artifact.artifactId, 1);

    await expect(
      renderArtifact(
        {
          artifactId: frontB.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
          format: "png",
          purpose: "final",
          organizationId: "org_b",
          projectId: "proj_b",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toThrow(/OWNERSHIP|Cross-tenant|not found|ARTIFACT/i);
  });

  it("LEGACY — contract asserts live traffic not migrated; no silent fallback", () => {
    expect(PACKAGING_RENDER_CONTRACT.liveTrafficMigrated).toBe(false);
    expect(PACKAGING_RENDER_CONTRACT.neverCallsAi).toBe(true);
    expect(PACKAGING_RENDER_CONTRACT.neverFabricatesGeometry).toBe(true);
    expect(PACKAGING_RENDER_CONTRACT.neverFabricatesSceneGraph).toBe(true);
    expect(
      PACKAGING_RENDER_CONTRACT.finalActionMapping.create_another_sku.status,
    ).toBe("not_a_renderer");
  });

  it("upstream assert helper rejects missing required refs", () => {
    expect(() =>
      assertPackagingUpstreamExactRefs(
        PACKAGING_ARTIFACT_KEYS.completePack,
        {
          surfaces: [],
        },
        { organizationId: "org_m8e", projectId: "proj_m8e" },
      ),
    ).toThrow(/missing exact upstream|dielineRef/i);
  });
});
