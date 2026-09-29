/**
 * CDF M8A — Packaging canonical artifact model + contract tests.
 */

import {
  createArtifact,
  createVersion,
  getArtifact,
  getArtifactVersion,
  getLatestArtifactVersion,
  listRegisteredArtifactSchemas,
  markApproved,
  markSelected,
  markValidated,
  rejectMutableUpdate,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_ARTIFACT_TYPE_BY_KEY,
  PACKAGING_SCHEMA_VERSION,
  packagingSchemaId,
  PACKAGING_FIXTURE_IDS,
  fixturePackagingDieline,
  fixturePackagingRoutes,
  fixturePackaging3dDirection,
  fixturePackagingFrontPack,
  fixturePackagingCompletePack,
  fixturePackagingViews,
  fixturePackagingSkuAdaptations,
  validatePackagingDielineData,
  validatePackagingRoutesData,
  validatePackaging3dDirectionData,
  validatePackagingFrontPackData,
  validatePackagingCompletePackData,
  validatePackagingViewsData,
  validatePackagingSkuAdaptationsData,
  validatePackagingArtifactData,
  rejectImageOnlyPackagingEnvelope,
  assertPackagingContractKeyAlignment,
  listPackagingPhaseContracts,
  getPackagingDependencyGraph,
  PACKAGING_DEPENDENCY_GRAPH,
  resetCdfArtifactEngineForTests,
  validateArtifactData,
  normalizeToPackagingData,
  normalizePackaging3dDirection,
  isVaultAssetObjectIdShape,
  isExecutionIdShape,
  isCdfCanonicalArtifactId,
  PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
} from "../../../src/platform/cdf";

describe("CDF M8A Packaging Artifact Model", () => {
  beforeEach(() => {
    resetCdfArtifactEngineForTests();
  });

  const KEYS = Object.values(PACKAGING_ARTIFACT_KEYS);

  it("A — every Packaging artifact key is registered", () => {
    const registered = listRegisteredArtifactSchemas();
    for (const key of KEYS) {
      const hit = registered.find(
        (s) =>
          s.artifactKey === key &&
          s.schemaVersion === PACKAGING_SCHEMA_VERSION,
      );
      expect(hit).toBeDefined();
      expect(hit!.schemaId).toBe(packagingSchemaId(key));
      expect(hit!.artifactType).toBe(PACKAGING_ARTIFACT_TYPE_BY_KEY[key]);
    }
  });

  it("B — every schema validates (fixtures A–H)", () => {
    expect(validatePackagingDielineData(fixturePackagingDieline() as never).ok).toBe(
      true,
    );
    expect(validatePackagingRoutesData(fixturePackagingRoutes() as never).ok).toBe(
      true,
    );
    expect(
      validatePackaging3dDirectionData(fixturePackaging3dDirection() as never).ok,
    ).toBe(true);
    expect(
      validatePackagingFrontPackData(fixturePackagingFrontPack() as never).ok,
    ).toBe(true);
    expect(
      validatePackagingCompletePackData(fixturePackagingCompletePack() as never)
        .ok,
    ).toBe(true);
    expect(validatePackagingViewsData(fixturePackagingViews() as never).ok).toBe(
      true,
    );
    expect(
      validatePackagingSkuAdaptationsData(
        fixturePackagingSkuAdaptations() as never,
      ).ok,
    ).toBe(true);
    // Design-system: Packaging has no DS phase — design direction lives on routes
    expect(fixturePackagingRoutes().routes.length).toBeGreaterThanOrEqual(3);
  });

  it("C — invalid schema is rejected", () => {
    expect(
      validatePackagingDielineData({
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline),
        pathKind: "bogus",
      } as never).ok,
    ).toBe(false);

    expect(
      validatePackagingRoutesData({
        schemaId: "wrong.schema",
        routes: [{ routeId: "route_01", name: "A" }],
      } as never).ok,
    ).toBe(false);

    expect(
      validatePackaging3dDirectionData({
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection),
        candidates: [],
        dielineRef: {
          artifactId: PACKAGING_FIXTURE_IDS.dielineArtifactId,
          version: 1,
        },
        routesRef: {
          artifactId: PACKAGING_FIXTURE_IDS.routesArtifactId,
          version: 1,
        },
      } as never).ok,
    ).toBe(false);
  });

  it("D — duplicate IDs rejected", () => {
    const routes = fixturePackagingRoutes();
    routes.routes[1]!.routeId = "route_01";
    expect(validatePackagingRoutesData(routes as never).ok).toBe(false);

    const skus = fixturePackagingSkuAdaptations();
    skus.skus[1]!.id = "sku_01";
    expect(validatePackagingSkuAdaptationsData(skus as never).ok).toBe(false);

    const views = fixturePackagingViews();
    views.views[1]!.id = "view_01";
    expect(validatePackagingViewsData(views as never).ok).toBe(false);
  });

  it("E — exact upstream artifact references required", () => {
    const threeD = fixturePackaging3dDirection();
    delete (threeD as { dielineRef?: unknown }).dielineRef;
    expect(validatePackaging3dDirectionData(threeD as never).ok).toBe(false);

    const complete = fixturePackagingCompletePack();
    delete (complete as { frontPackRef?: unknown }).frontPackRef;
    expect(validatePackagingCompletePackData(complete as never).ok).toBe(false);
  });

  it("F — missing dependency rejected", () => {
    expect(
      validatePackagingViewsData({
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views),
        views: [{ id: "view_01", name: "Front" }],
      } as never).ok,
    ).toBe(false);

    expect(
      validatePackagingFrontPackData({
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack),
        frontId: "package_surface_front",
        routesRef: {
          artifactId: PACKAGING_FIXTURE_IDS.routesArtifactId,
          version: 1,
        },
      } as never).ok,
    ).toBe(false);
  });

  it("G — version-specific dependency preserved", () => {
    const complete = fixturePackagingCompletePack({
      frontArtifactId: "cdfart_fixture_packaging_front_01",
      frontVersion: 4,
      routesVersion: 3,
      dielineVersion: 2,
      threeDVersion: 1,
    });
    expect(complete.frontPackRef.version).toBe(4);
    expect(complete.routesRef.version).toBe(3);
    expect(complete.dielineRef.version).toBe(2);
    expect(validatePackagingCompletePackData(complete as never).ok).toBe(true);

    const graph = getPackagingDependencyGraph();
    expect(graph["packaging.complete-pack"]).toEqual(
      PACKAGING_DEPENDENCY_GRAPH["packaging.complete-pack"],
    );
    expect(graph["packaging.complete-pack"]).toContain(
      PACKAGING_ARTIFACT_KEYS.frontPack,
    );
  });

  it("H — Vault ObjectId validation", () => {
    expect(isVaultAssetObjectIdShape(PACKAGING_FIXTURE_IDS.vaultImage)).toBe(
      true,
    );
    const dieline = fixturePackagingDieline();
    dieline.uploadedAssetRefs![0]!.vaultAssetId = "not-a-vault-id";
    expect(validatePackagingDielineData(dieline as never).ok).toBe(false);
  });

  it("I — execution ID rejected as asset ID", () => {
    expect(isExecutionIdShape("exec_abc")).toBe(true);
    const front = fixturePackagingFrontPack();
    front.previewAssetRef = { vaultAssetId: "exec_abc" };
    expect(validatePackagingFrontPackData(front as never).ok).toBe(false);
  });

  it("J — artifact ID rejected where Vault ObjectId is expected", () => {
    expect(isCdfCanonicalArtifactId("cdfart_x")).toBe(true);
    const threeD = fixturePackaging3dDirection();
    threeD.candidates[0]!.previewAssetRef = {
      vaultAssetId: "cdfart_fixture_packaging_3d_01",
    };
    expect(validatePackaging3dDirectionData(threeD as never).ok).toBe(false);
  });

  it("K — lifecycle semantics work through M3A", () => {
    const created = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    markValidated(created.artifact.artifactId, 1);
    expect(getArtifactVersion(created.artifact.artifactId, 1).status).toBe(
      "validated",
    );
  });

  it("L — selection remains distinct from approval", () => {
    const routes = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes() as never,
    });
    markSelected(routes.artifact.artifactId, 1);
    const v = getArtifactVersion(routes.artifact.artifactId, 1);
    expect(v.status).toBe("selected");
    expect(v.status).not.toBe("approved");

    markApproved(routes.artifact.artifactId, 1);
    expect(getArtifactVersion(routes.artifact.artifactId, 1).status).toBe(
      "approved",
    );
  });

  it("M — artifact versions remain immutable", () => {
    const created = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    expect(() =>
      rejectMutableUpdate(created.artifact.artifactId, 1, {
        pathKind: "none",
      } as never),
    ).toThrow();

    const next = fixturePackagingDieline();
    next.pathKind = "none";
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: next as never,
    });
    expect(getLatestArtifactVersion(created.artifact.artifactId).version).toBe(
      2,
    );
    expect(getArtifactVersion(created.artifact.artifactId, 1).data.pathKind).toBe(
      "upload_dieline",
    );
  });

  it("N — schema version is recorded", () => {
    const created = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "views",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
      artifactType: "pack",
      data: fixturePackagingViews() as never,
    });
    expect(created.version.schemaVersion).toBe(PACKAGING_SCHEMA_VERSION);
    expect(created.version.data.schemaId).toBe(
      packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views),
    );
  });

  it("O — cross-tenant artifact references rejected", () => {
    const a = createArtifact({
      sessionId: "s_a",
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    expect(() =>
      getArtifact(a.artifact.artifactId, {
        organizationId: "org_b",
        projectId: "proj_a",
      }),
    ).toThrow();
  });

  it("P — malformed provider envelope rejected", () => {
    expect(() =>
      normalizeToPackagingData(PACKAGING_ARTIFACT_KEYS.routes, "not-json-object"),
    ).toThrow(/malformed|JSON object|missing|PACKAGING_CANONICALIZATION_UNSUPPORTED|prose/i);

    expect(() =>
      normalizeToPackagingData(PACKAGING_ARTIFACT_KEYS.routes, {
        routes: "nope",
      }),
    ).toThrow();
  });

  it("Q — image-only output is not falsely accepted as structured 3D state", () => {
    expect(
      rejectImageOnlyPackagingEnvelope(
        { imageUrl: "https://example.com/x.png" },
        "packaging.3d-direction",
      ).ok,
    ).toBe(false);

    expect(
      validatePackaging3dDirectionData({
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection),
        url: "https://cdn.example/preview.png",
        mediaId: "art_123",
      } as never).ok,
    ).toBe(false);

    expect(() =>
      normalizePackaging3dDirection(
        { imageUrl: "https://example.com/x.png" },
        {
          dielineRef: {
            artifactId: PACKAGING_FIXTURE_IDS.dielineArtifactId,
            version: 1,
          },
          routesRef: {
            artifactId: PACKAGING_FIXTURE_IDS.routesArtifactId,
            version: 1,
          },
        },
      ),
    ).toThrow(/image|structured/i);
  });

  it("R — lineage preserved", () => {
    const dieline = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const routes = createArtifact({
      sessionId: "s_pack",
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_pack",
      projectId: "proj_pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(dieline.artifact.artifactId, 1) as never,
      sourceArtifacts: [
        {
          artifactId: dieline.artifact.artifactId,
          version: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
          relationship: "uses",
        },
      ],
    });
    expect(routes.version.lineage.sourceArtifacts[0]!.version).toBe(1);
    expect(routes.version.lineage.sourceArtifacts[0]!.artifactId).toBe(
      dieline.artifact.artifactId,
    );
  });

  it("S — deterministic fixtures validate via registry", () => {
    for (const key of KEYS) {
      const data =
        key === PACKAGING_ARTIFACT_KEYS.dieline
          ? fixturePackagingDieline()
          : key === PACKAGING_ARTIFACT_KEYS.routes
            ? fixturePackagingRoutes()
            : key === PACKAGING_ARTIFACT_KEYS.threeDDirection
              ? fixturePackaging3dDirection()
              : key === PACKAGING_ARTIFACT_KEYS.frontPack
                ? fixturePackagingFrontPack()
                : key === PACKAGING_ARTIFACT_KEYS.completePack
                  ? fixturePackagingCompletePack()
                  : key === PACKAGING_ARTIFACT_KEYS.views
                    ? fixturePackagingViews()
                    : fixturePackagingSkuAdaptations();
      expect(
        validatePackagingArtifactData(key, data as never).ok,
      ).toBe(true);
      validateArtifactData({
        artifactType: PACKAGING_ARTIFACT_TYPE_BY_KEY[key] as never,
        artifactKey: key,
        schemaVersion: PACKAGING_SCHEMA_VERSION,
        data: data as never,
      });
    }
    expect(PACKAGING_PHYSICAL_COORDINATE_SYSTEM).toBe("physical_mm");
  });

  it("T — contract matches Packaging phases", () => {
    const alignment = assertPackagingContractKeyAlignment();
    expect(alignment.mismatches).toEqual([]);
    expect(alignment.ok).toBe(true);

    const rows = listPackagingPhaseContracts();
    expect(rows.map((r) => r.phaseId)).toEqual([
      "dieline",
      "routes",
      "3d-direction",
      "front-pack",
      "complete-pack",
      "views",
      "sku-adaptations",
      "final",
    ]);
    expect(rows.find((r) => r.phaseId === "final")!.artifactKey).toBeNull();
    expect(rows.find((r) => r.phaseId === "routes")!.artifactKey).toBe(
      PACKAGING_ARTIFACT_KEYS.routes,
    );
  });
});
