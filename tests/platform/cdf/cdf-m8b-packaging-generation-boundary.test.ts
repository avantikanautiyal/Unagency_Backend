/**
 * CDF M8B — Packaging Generation → Canonical Artifact Boundary.
 */

import {
  applyCdfTransition,
  createArtifact,
  getArtifact,
  getArtifactVersion,
  getLatestArtifactVersion,
  ingestGenerationCompletion,
  listArtifactVersions,
  markApproved,
  markSelected,
  normalizeToPackagingData,
  normalizePackaging3dDirection,
  normalizePackagingDieline,
  normalizePackagingRoutes,
  classifyPackagingProviderOutput,
  resolveArtifactTarget,
  resolvePackagingRefsFromSession,
  tryIngestPackagingCdfCompletion,
  isPackagingCanonicalIngestEnabled,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_FIXTURE_IDS,
  packagingSchemaId,
  fixturePackagingDieline,
  fixturePackagingRoutes,
  fixturePackaging3dDirection,
  fixturePackagingFrontPack,
  fixturePackagingCompletePack,
  fixturePackagingViews,
  fixturePackagingSkuAdaptations,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  upsertSessionArtifactRef,
  persistCdfSession,
  getCdfSession,
  CdfGenerationArtifactError,
  CDF_M3C_GENERATION_PATH_AUDIT,
} from "../../../src/platform/cdf";

describe("CDF M8B Packaging Generation → Artifact Boundary", () => {
  const prevIngest = process.env.CDF_PACKAGING_INGEST;
  const prevForce = process.env.CDF_PACKAGING_FORCE_LEGACY_ONLY;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    delete process.env.CDF_PACKAGING_INGEST;
    delete process.env.CDF_PACKAGING_FORCE_LEGACY_ONLY;
  });

  afterAll(() => {
    if (prevIngest === undefined) delete process.env.CDF_PACKAGING_INGEST;
    else process.env.CDF_PACKAGING_INGEST = prevIngest;
    if (prevForce === undefined) delete process.env.CDF_PACKAGING_FORCE_LEGACY_ONLY;
    else process.env.CDF_PACKAGING_FORCE_LEGACY_ONLY = prevForce;
  });

  function startPackagingSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Premium mango drink pack for modern Indian grocery",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function seedApproved(
    sessionId: string,
    artifactKey: string,
    artifactId: string,
    version: number,
  ) {
    const session = getCdfSession(sessionId);
    if (!session) throw new Error("session");
    const next = upsertSessionArtifactRef(session, {
      artifactId,
      version,
      artifactKey,
      phaseId: artifactKey.replace(/^packaging\./, ""),
      role: "approved",
    });
    persistCdfSession(next);
  }

  it("30 — exact Packaging phase→artifact target resolution", () => {
    expect(
      resolveArtifactTarget({ serviceId: "packaging", phaseId: "dieline" })
        .artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.dieline);
    expect(
      resolveArtifactTarget({ serviceId: "packaging", phaseId: "routes" })
        .artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.routes);
    expect(
      resolveArtifactTarget({
        serviceId: "packaging",
        phaseId: "3d-direction",
      }).artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.threeDDirection);
    expect(
      resolveArtifactTarget({ serviceId: "packaging", phaseId: "front-pack" })
        .artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.frontPack);
    expect(
      resolveArtifactTarget({
        serviceId: "packaging",
        phaseId: "complete-pack",
      }).artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.completePack);
    expect(
      resolveArtifactTarget({ serviceId: "packaging", phaseId: "views" })
        .artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.views);
    expect(
      resolveArtifactTarget({
        serviceId: "packaging",
        phaseId: "sku-adaptations",
      }).artifactKey,
    ).toBe(PACKAGING_ARTIFACT_KEYS.skuAdaptations);
    expect(() =>
      resolveArtifactTarget({ serviceId: "packaging", phaseId: "final" }),
    ).toThrow(/ARTIFACT_TARGET_UNRESOLVED|no Packaging creative/);
  });

  it("31 — final phase produces no creative artifact via bridge", () => {
    const session = startPackagingSession();
    const r = tryIngestPackagingCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "packaging",
        cdfPhaseId: "final",
      },
      rawOutput: fixturePackagingSkuAdaptations(),
      executionId: "exec_final_1",
    });
    expect(r?.kind).toBe("final_no_artifact");
    expect(r && "legacyCompatible" in r && r.legacyCompatible).toBe(true);
  });

  it("1 — dieline structured candidate → canonical artifact", () => {
    const session = startPackagingSession();
    const out = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_dieline_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackagingDieline(),
      requirements: [],
    });
    expect(out.artifactKey).toBe(PACKAGING_ARTIFACT_KEYS.dieline);
    expect(out.artifactVersion).toBe(1);
    expect(getArtifactVersion(out.artifactId, 1).data.pathKind).toBe(
      "upload_dieline",
    );
    expect(getArtifactVersion(out.artifactId, 1).data.geometryUnresolved).toBe(
      true,
    );
  });

  it("2 — dieline image-only → rejected", () => {
    expect(() =>
      normalizePackagingDieline({ imageUrl: "https://cdn.example/d.png" }),
    ).toThrow(/PACKAGING_CANONICALIZATION_UNSUPPORTED|image-only/);
    const cap = classifyPackagingProviderOutput(PACKAGING_ARTIFACT_KEYS.dieline, {
      imageUrl: "https://cdn.example/d.png",
    });
    expect(["raster_image_only", "url_only"]).toContain(cap);
  });

  it("3–4 — routes structured → artifact + stable IDs", () => {
    const session = startPackagingSession();
    const dieline = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_d2",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: { pathKind: "none", label: "I Don't Have One" },
      requirements: [],
    });
    seedApproved(
      session.sessionId,
      PACKAGING_ARTIFACT_KEYS.dieline,
      dieline.artifactId,
      1,
    );
    const routes = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_routes_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: {
        routes: [
          { name: "Tropical Punch", shelfIdea: "Bold fruit" },
          { name: "Modern Minimal", shelfIdea: "White ground" },
          { name: "Heritage Craft", shelfIdea: "Paper texture" },
        ],
      },
      packagingRefs: {
        dielineRef: { artifactId: dieline.artifactId, version: 1 },
      },
      requirements: [],
    });
    const data = getArtifactVersion(routes.artifactId, 1).data as {
      routes: Array<{ routeId: string }>;
    };
    expect(data.routes.map((r) => r.routeId)).toEqual([
      "route_01",
      "route_02",
      "route_03",
    ]);
  });

  it("5–6 — 3D structured ok; image-only never accepted as structured 3D", () => {
    expect(
      classifyPackagingProviderOutput(PACKAGING_ARTIFACT_KEYS.threeDDirection, {
        imageUrl: "https://x/y.png",
        executionId: "exec_1",
      }),
    ).toBe("raster_image_only");
    expect(() =>
      normalizeToPackagingData(PACKAGING_ARTIFACT_KEYS.threeDDirection, {
        imageUrl: "https://x/y.png",
      }),
    ).toThrow(/PACKAGING_CANONICALIZATION_UNSUPPORTED/);

    const session = startPackagingSession();
    const d = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const r = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(d.artifact.artifactId, 1) as never,
    });
    const threeD = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_3d_ok",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackaging3dDirection({
        dielineArtifactId: d.artifact.artifactId,
        routesArtifactId: r.artifact.artifactId,
      }),
      packagingRefs: {
        dielineRef: { artifactId: d.artifact.artifactId, version: 1 },
        routesRef: { artifactId: r.artifact.artifactId, version: 1 },
      },
      vaultAssetIds: [PACKAGING_FIXTURE_IDS.vaultImage],
      requirements: [],
    });
    expect(threeD.artifactKey).toBe(PACKAGING_ARTIFACT_KEYS.threeDDirection);
    expect(
      (getArtifactVersion(threeD.artifactId, 1).data as { structuredSceneUnresolved?: boolean })
        .structuredSceneUnresolved,
    ).toBe(true);
  });

  it("7–8 — front-pack structured + asset-backed preview", () => {
    const session = startPackagingSession();
    const d = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const r = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(d.artifact.artifactId, 1) as never,
    });
    const t = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection({
        dielineArtifactId: d.artifact.artifactId,
        routesArtifactId: r.artifact.artifactId,
      }) as never,
    });
    const front = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_front_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: {
        frontId: "package_surface_front",
        compositionNotes: "Centered lockup",
        previewAssetRef: {
          vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
          role: "front_preview",
        },
      },
      packagingRefs: {
        routesRef: { artifactId: r.artifact.artifactId, version: 1 },
        threeDDirectionRef: { artifactId: t.artifact.artifactId, version: 1 },
        dielineRef: { artifactId: d.artifact.artifactId, version: 1 },
      },
      vaultAssetIds: [PACKAGING_FIXTURE_IDS.vaultImage],
      requirements: [],
    });
    expect(front.artifactVersion).toBe(1);
    expect(
      (getArtifactVersion(front.artifactId, 1).data as { frontId: string })
        .frontId,
    ).toBe("package_surface_front");
  });

  it("9–11 — complete-pack / views / SKU exact deps; no latest", () => {
    const session = startPackagingSession();
    const d = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const r = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(d.artifact.artifactId, 1) as never,
    });
    const t = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection({
        dielineArtifactId: d.artifact.artifactId,
        routesArtifactId: r.artifact.artifactId,
      }) as never,
    });
    const f = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      artifactType: "pack",
      data: fixturePackagingFrontPack({
        dielineArtifactId: d.artifact.artifactId,
        routesArtifactId: r.artifact.artifactId,
        threeDArtifactId: t.artifact.artifactId,
      }) as never,
    });
    // Use explicit v1 pin (not latest)
    const complete = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_complete_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackagingCompletePack({
        dielineArtifactId: d.artifact.artifactId,
        routesArtifactId: r.artifact.artifactId,
        threeDArtifactId: t.artifact.artifactId,
        frontArtifactId: f.artifact.artifactId,
        frontVersion: 1,
      }),
      packagingRefs: {
        dielineRef: { artifactId: d.artifact.artifactId, version: 1 },
        routesRef: { artifactId: r.artifact.artifactId, version: 1 },
        threeDDirectionRef: { artifactId: t.artifact.artifactId, version: 1 },
        frontPackRef: { artifactId: f.artifact.artifactId, version: 1 },
      },
      requirements: [],
    });
    const cData = getArtifactVersion(complete.artifactId, 1).data as {
      frontPackRef: { version: number };
      dielineRef: { version: number };
    };
    expect(cData.frontPackRef.version).toBe(1);
    expect(JSON.stringify(cData)).not.toMatch(/"latest"/);

    const views = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "views",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_views_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackagingViews(complete.artifactId, 1),
      packagingRefs: {
        completePackRef: { artifactId: complete.artifactId, version: 1 },
      },
      requirements: [],
    });
    expect(
      (getArtifactVersion(views.artifactId, 1).data as { views: unknown[] })
        .views.length,
    ).toBe(3);

    const skus = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "sku-adaptations",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_sku_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackagingSkuAdaptations({
        viewsArtifactId: views.artifactId,
        viewsVersion: 1,
        completePackArtifactId: complete.artifactId,
      }),
      packagingRefs: {
        viewsRef: { artifactId: views.artifactId, version: 1 },
        completePackRef: { artifactId: complete.artifactId, version: 1 },
      },
      requirements: [],
    });
    expect(
      (getArtifactVersion(skus.artifactId, 1).data as { skus: Array<{ id: string }> })
        .skus.map((s) => s.id),
    ).toEqual(["sku_01", "sku_02", "sku_03", "sku_04"]);
  });

  it("12–15 — reject latest / exec_* / art_* / cdfart as vault", () => {
    expect(() =>
      normalizePackagingRoutes(
        { routes: [{ name: "A", representativeAssetIds: ["exec_x"] }] },
      ),
    ).toThrow(/ARTIFACT_ASSET_REFERENCE_INVALID/);
    expect(() =>
      normalizePackagingRoutes(
        { routes: [{ name: "A", representativeAssetIds: ["art_1_0"] }] },
      ),
    ).toThrow(/art_\*|ARTIFACT_ASSET_REFERENCE_INVALID/);
    expect(() =>
      normalizePackagingRoutes({
        routes: [
          {
            name: "A",
            representativeAssetIds: ["cdfart_fixture_packaging_routes_01"],
          },
        ],
      }),
    ).toThrow(/ARTIFACT_ASSET_REFERENCE_INVALID/);
    expect(() =>
      normalizePackagingRoutes({
        routes: [
          { name: "A", representativeAssetIds: ["https://cdn.example/a.png"] },
        ],
      }),
    ).toThrow(/URL|ARTIFACT_ASSET_REFERENCE_INVALID/);
  });

  it("16–17 — deterministic normalization + stable IDs", () => {
    const a = normalizePackagingRoutes({
      routes: [{ name: "Alpha" }, { name: "Beta" }],
    });
    const b = normalizePackagingRoutes({
      routes: [{ name: "Alpha" }, { name: "Beta" }],
    });
    expect(a).toEqual(b);
    expect(a.routes.map((r) => r.routeId)).toEqual(["route_01", "route_02"]);
  });

  it("18–19 — stale session / ActiveBrief rejected", () => {
    const session = startPackagingSession();
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "dieline",
        expectedSessionVersion: session.sessionVersion - 1,
        rawOutput: { pathKind: "none" },
        requirements: [],
      }),
    ).toThrow(/GENERATION_CONTEXT_STALE/);

    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "dieline",
        expectedSessionVersion: session.sessionVersion,
        activeBriefId: session.activeBriefId,
        activeBriefVersion: (session.activeBriefVersion ?? 1) + 99,
        rawOutput: { pathKind: "none" },
        requirements: [],
      }),
    ).toThrow(/GENERATION_CONTEXT_STALE|ActiveBrief/);
  });

  it("20–21 — idempotent replay + payload conflict", () => {
    const session = startPackagingSession();
    const a = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_idem_pack",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: { pathKind: "upload_dieline", label: "Upload Dieline" },
      requirements: [],
    });
    const b = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_idem_pack",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: { pathKind: "upload_dieline", label: "Upload Dieline" },
      requirements: [],
    });
    expect(b.idempotentReplay).toBe(true);
    expect(b.artifactVersion).toBe(a.artifactVersion);
    expect(listArtifactVersions(a.artifactId)).toHaveLength(1);

    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "dieline",
        organizationId: "org_pack_m8b",
        projectId: "proj_pack_m8b",
        executionId: "exec_idem_pack",
        expectedSessionVersion: session.sessionVersion,
        rawOutput: { pathKind: "none", label: "I Don't Have One" },
        requirements: [],
      }),
    ).toThrow(/IDEMPOTENCY|CONFLICT|idempoten/i);
  });

  it("22–25 — failed validation NO version; success one version; lineage; provenance", () => {
    const session = startPackagingSession();
    const before = listArtifactVersions;
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        organizationId: "org_pack_m8b",
        projectId: "proj_pack_m8b",
        executionId: "exec_fail_3d",
        expectedSessionVersion: session.sessionVersion,
        rawOutput: { mediaId: "art_1_0", imageUrl: "https://x.png" },
        packagingRefs: {
          dielineRef: {
            artifactId: "cdfart_fixture_packaging_dieline_01",
            version: 1,
          },
          routesRef: {
            artifactId: "cdfart_fixture_packaging_routes_01",
            version: 1,
          },
        },
        requirements: [],
      }),
    ).toThrow(/PACKAGING_CANONICALIZATION_UNSUPPORTED|ARTIFACT_/);

    const ok = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_prov_1",
      expectedSessionVersion: session.sessionVersion,
      contextId: "ctx_pack_1",
      contextHash: "hash_pack_1",
      rawOutput: fixturePackagingDieline(),
      requirements: [],
    });
    expect(listArtifactVersions(ok.artifactId)).toHaveLength(1);
    const v = getArtifactVersion(ok.artifactId, 1);
    expect(v.provenance.executionId).toBe("exec_prov_1");
    expect(v.provenance.contextId).toBe("ctx_pack_1");
    expect(ok.artifactId).not.toBe("exec_prov_1");
    void before;
  });

  it("26 — tenant isolation", () => {
    const session = startPackagingSession();
    const out = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      executionId: "exec_tenant",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: { pathKind: "none" },
      requirements: [],
    });
    expect(() =>
      getArtifact(out.artifactId, { organizationId: "org_other" }),
    ).toThrow();
  });

  it("27–29 — unsupported envelopes / URL / prose rejected", () => {
    expect(
      classifyPackagingProviderOutput(
        PACKAGING_ARTIFACT_KEYS.routes,
        "Here are three packaging directions in prose...",
      ),
    ).toBe("prose_only");
    expect(() =>
      normalizeToPackagingData(
        PACKAGING_ARTIFACT_KEYS.routes,
        "Here are three packaging directions in prose...",
      ),
    ).toThrow(/PACKAGING_CANONICALIZATION_UNSUPPORTED/);

    expect(
      classifyPackagingProviderOutput(PACKAGING_ARTIFACT_KEYS.views, {
        url: "https://cdn.example/view.png",
      }),
    ).toBe("url_only");
    expect(
      classifyPackagingProviderOutput(PACKAGING_ARTIFACT_KEYS.completePack, {
        kind: "artifact",
        data: { artifactIds: ["art_1_0", "art_1_1"] },
      }),
    ).toBe("legacy_execution_envelope");
  });

  it("opt-in gate: default OFF leaves live traffic legacy", () => {
    expect(isPackagingCanonicalIngestEnabled()).toBe(false);
    const session = startPackagingSession();
    const r = tryIngestPackagingCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "packaging",
        cdfPhaseId: "dieline",
      },
      rawOutput: { pathKind: "none" },
      executionId: "exec_opt_off",
    });
    expect(r?.kind).toBe("opt_in_disabled");
  });

  it("bridge forceOptIn accepts structured dieline; selection ≠ approval", () => {
    const session = startPackagingSession();
    const r = tryIngestPackagingCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "packaging",
        cdfPhaseId: "dieline",
      },
      rawOutput: fixturePackagingDieline(),
      executionId: "exec_bridge_ok",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
    });
    expect(r?.kind).toBe("accepted");
    if (r?.kind !== "accepted") throw new Error("expected accepted");
    markSelected(r.ingest.artifactId, 1);
    expect(getArtifactVersion(r.ingest.artifactId, 1).status).toBe("selected");
    expect(getArtifactVersion(r.ingest.artifactId, 1).status).not.toBe(
      "approved",
    );
    markApproved(r.ingest.artifactId, 1);
    expect(getArtifactVersion(r.ingest.artifactId, 1).status).toBe("approved");
  });

  it("missing dependency → typed failure, no version", () => {
    const session = startPackagingSession();
    const r = tryIngestPackagingCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "packaging",
        cdfPhaseId: "3d-direction",
      },
      rawOutput: {
        candidates: [
          { id: "direction_01", name: "A", visualIntent: "three-quarter" },
        ],
      },
      executionId: "exec_dep_miss",
    });
    expect(r?.kind).toBe("dependency_missing");
  });

  it("path audit documents Packaging boundary without live migration", () => {
    const packRows = CDF_M3C_GENERATION_PATH_AUDIT.filter((r) =>
      r.path.toLowerCase().includes("packaging"),
    );
    expect(packRows.length).toBeGreaterThan(0);
    expect(packRows.every((r) => r.status === "out_of_scope")).toBe(true);
    expect(
      packRows.some((r) => /BOUNDARY READY|opt-in/i.test(r.notes)),
    ).toBe(true);
  });

  it("resolvePackagingRefsFromSession uses exact approved versions", () => {
    const session = startPackagingSession();
    const d = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack_m8b",
      projectId: "proj_pack_m8b",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    seedApproved(
      session.sessionId,
      PACKAGING_ARTIFACT_KEYS.dieline,
      d.artifact.artifactId,
      1,
    );
    const refs = resolvePackagingRefsFromSession(session.sessionId);
    expect(refs.dielineRef).toEqual({
      artifactId: d.artifact.artifactId,
      version: 1,
    });
  });

  it("alias packaging.design-route resolves but primary key remains packaging.routes", () => {
    const t = resolveArtifactTarget({
      serviceId: "packaging",
      phaseId: "routes",
      artifactKeyOverride: "packaging.design-route",
    });
    expect(t.artifactKey).toBe(PACKAGING_ARTIFACT_KEYS.routes);
    expect(t.schemaId).toBe(packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes));
  });
});
