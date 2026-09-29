/**
 * CDF M9A — Social Media canonical artifact model + contract tests.
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
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY,
  SOCIAL_MEDIA_SCHEMA_VERSION,
  socialMediaSchemaId,
  SOCIAL_MEDIA_FIXTURE_IDS,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaSizeReference,
  fixtureSocialMediaSizeEnter,
  fixtureSocialMediaSizeUploadReference,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaOutput,
  validateSocialMediaPlatformData,
  validateSocialMediaSizeReferenceData,
  validateSocialMediaRoutesData,
  validateSocialMediaOutputData,
  validateSocialMediaArtifactData,
  rejectImageOnlySocialMediaEnvelope,
  assertSocialMediaContractKeyAlignment,
  listSocialMediaPhaseContracts,
  getSocialMediaDependencyGraph,
  SOCIAL_MEDIA_DEPENDENCY_GRAPH,
  SOCIAL_MEDIA_ARTIFACT_CONTRACT,
  SOCIAL_MEDIA_PLATFORMS,
  SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
  resetCdfArtifactEngineForTests,
  validateArtifactData,
  isVaultAssetObjectIdShape,
  isExecutionIdShape,
  isCdfCanonicalArtifactId,
  resolveSocialMediaArtifactKey,
} from "../../../src/platform/cdf";

describe("CDF M9A Social Media Artifact Model", () => {
  beforeEach(() => {
    resetCdfArtifactEngineForTests();
  });

  const KEYS = Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS);

  it("A — every Social Media artifact key is registered", () => {
    const registered = listRegisteredArtifactSchemas();
    for (const key of KEYS) {
      const hit = registered.find(
        (s) =>
          s.artifactKey === key &&
          s.schemaVersion === SOCIAL_MEDIA_SCHEMA_VERSION,
      );
      expect(hit).toBeDefined();
      expect(hit!.schemaId).toBe(socialMediaSchemaId(key));
      expect(hit!.artifactType).toBe(SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY[key]);
    }
  });

  it("B — every schema validates fixtures", () => {
    expect(
      validateSocialMediaPlatformData(fixtureSocialMediaPlatform() as never).ok,
    ).toBe(true);
    expect(
      validateSocialMediaSizeReferenceData(
        fixtureSocialMediaSizeReference() as never,
      ).ok,
    ).toBe(true);
    expect(
      validateSocialMediaSizeReferenceData(
        fixtureSocialMediaSizeEnter() as never,
      ).ok,
    ).toBe(true);
    expect(
      validateSocialMediaSizeReferenceData(
        fixtureSocialMediaSizeUploadReference() as never,
      ).ok,
    ).toBe(true);
    expect(
      validateSocialMediaRoutesData(fixtureSocialMediaRoutes() as never).ok,
    ).toBe(true);
    expect(
      validateSocialMediaOutputData(fixtureSocialMediaOutput() as never).ok,
    ).toBe(true);

    for (const key of KEYS) {
      const data =
        key === SOCIAL_MEDIA_ARTIFACT_KEYS.platform
          ? fixtureSocialMediaPlatform()
          : key === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference
            ? fixtureSocialMediaSizeReference()
            : key === SOCIAL_MEDIA_ARTIFACT_KEYS.routes
              ? fixtureSocialMediaRoutes()
              : fixtureSocialMediaOutput();
      expect(validateSocialMediaArtifactData(key, data as never).ok).toBe(true);
      expect(() =>
        validateArtifactData({
          artifactType: SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY[key],
          schemaVersion: SOCIAL_MEDIA_SCHEMA_VERSION,
          artifactKey: key,
          data: data as never,
        }),
      ).not.toThrow();
    }
  });

  it("C — invalid structures fail explicitly", () => {
    expect(
      validateSocialMediaPlatformData({
        ...fixtureSocialMediaPlatform(),
        platform: "tiktok",
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaSizeReferenceData({
        ...fixtureSocialMediaSizeEnter(),
        canvas: undefined,
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaSizeReferenceData({
        ...fixtureSocialMediaSizeReference(),
        canvas: {
          widthPx: -1,
          heightPx: 1080,
          coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
        },
      } as never).ok,
    ).toBe(false);

    const routes = fixtureSocialMediaRoutes();
    expect(
      validateSocialMediaRoutesData({
        ...routes,
        routes: routes.routes.slice(0, 2),
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaRoutesData({
        ...routes,
        selectedRouteId: "route_missing",
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaRoutesData({
        ...routes,
        routes: [
          { ...routes.routes[0], routeId: "route_01" },
          { ...routes.routes[1], routeId: "route_01" },
          routes.routes[2],
        ],
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaOutputData({
        ...fixtureSocialMediaOutput(),
        routesRef: {
          artifactId: "cdfart_x",
          version: "latest",
        },
      } as never).ok,
    ).toBe(false);

    expect(
      rejectImageOnlySocialMediaEnvelope(
        { url: "https://example.com/x.png" },
        "test",
      ).ok,
    ).toBe(false);
  });

  it("D — Vault rules reject art_*/exec_*/cdfart_*/urls as asset ids", () => {
    expect(isVaultAssetObjectIdShape(SOCIAL_MEDIA_FIXTURE_IDS.vaultImage)).toBe(
      true,
    );
    expect(isExecutionIdShape("exec_1")).toBe(true);
    expect(isCdfCanonicalArtifactId("cdfart_x")).toBe(true);

    expect(
      validateSocialMediaOutputData({
        ...fixtureSocialMediaOutput(),
        previewAssetRef: { vaultAssetId: "art_legacy_1" },
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaOutputData({
        ...fixtureSocialMediaOutput(),
        previewAssetRef: { vaultAssetId: "exec_abc" },
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaOutputData({
        ...fixtureSocialMediaOutput(),
        previewAssetRef: { vaultAssetId: "cdfart_fixture_social_output_01" },
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaOutputData({
        ...fixtureSocialMediaOutput(),
        previewAssetRef: { vaultAssetId: "https://cdn.example/x.png" },
      } as never).ok,
    ).toBe(false);
  });

  it("E — exact upstream refs; no HEAD; stable ids", () => {
    const out = fixtureSocialMediaOutput();
    expect(out.routesRef.version).toBe(1);
    expect(out.creativeId).toBe("creative_01");
    expect(out.routesRef.artifactId.startsWith("cdfart_")).toBe(true);

    expect(
      validateSocialMediaOutputData({
        ...out,
        routesRef: { artifactId: "art_not_canonical", version: 1 },
      } as never).ok,
    ).toBe(false);

    expect(
      validateSocialMediaOutputData({
        ...out,
        creativeId: "1_bad",
      } as never).ok,
    ).toBe(false);
  });

  it("F — M3A lifecycle: selection ≠ approval; immutable versions", () => {
    const created = createArtifact({
      organizationId: "org_m9a",
      projectId: "proj_m9a",
      sessionId: "cdf_m9a_1",
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput() as never,
    });
    markValidated(created.artifact.artifactId, 1);
    markSelected(created.artifact.artifactId, 1);
    markApproved(created.artifact.artifactId, 1);

    const head = getArtifact(created.artifact.artifactId);
    expect(head.status).toBe("approved");

    const v1 = getArtifactVersion(created.artifact.artifactId, 1);
    expect(v1.version).toBe(1);

    expect(() =>
      rejectMutableUpdate(created.artifact.artifactId, 1, {
        creativeId: "mutated",
      } as never),
    ).toThrow();

    const v2 = createVersion({
      artifactId: created.artifact.artifactId,
      data: {
        ...fixtureSocialMediaOutput(),
        creativeId: "creative_01",
        compositionNotes: "refined note",
      } as never,
      expectedLatestVersion: 1,
    });
    expect(v2.version.version).toBe(2);
    expect(getLatestArtifactVersion(created.artifact.artifactId).version).toBe(2);
    // v1 pin remains readable
    expect(
      getArtifactVersion(created.artifact.artifactId, 1).data,
    ).toMatchObject({ creativeId: "creative_01" });
  });

  it("G — contract alignment with M1 registry; final has no creative schema", () => {
    const align = assertSocialMediaContractKeyAlignment();
    expect(align.ok).toBe(true);
    expect(align.mismatches).toEqual([]);

    const rows = listSocialMediaPhaseContracts();
    expect(rows.map((r) => r.phaseId)).toEqual([
      "platform",
      "size-reference",
      "routes",
      "output",
      "final",
    ]);
    const finalRow = rows.find((r) => r.phaseId === "final");
    expect(finalRow?.artifactKey).toBeNull();
    expect(finalRow?.schemaId).toBeNull();

    const outputRow = rows.find((r) => r.phaseId === "output");
    expect(outputRow?.approvalBehavior).toBe("required");
    expect(outputRow?.selectionBehavior).toBe("required_one");
    expect(outputRow?.refinementSupport).toBe(true);

    const routesRow = rows.find((r) => r.phaseId === "routes");
    expect(routesRow?.approvalBehavior).toBe("not_applicable");
    expect(routesRow?.generationModality).toBe("text");

    expect(SOCIAL_MEDIA_ARTIFACT_CONTRACT.finalHasCreativeSchema).toBe(false);
    expect(SOCIAL_MEDIA_ARTIFACT_CONTRACT.liveTrafficMigrated).toBe(false);
    expect(SOCIAL_MEDIA_ARTIFACT_CONTRACT.carouselNotInCdfPhaseGraph).toBe(true);
  });

  it("H — dependency graph exact keys; platforms controlled vocabulary", () => {
    expect(getSocialMediaDependencyGraph()).toEqual(SOCIAL_MEDIA_DEPENDENCY_GRAPH);
    expect(SOCIAL_MEDIA_DEPENDENCY_GRAPH["social-media.output"]).toEqual([
      SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    ]);
    expect(SOCIAL_MEDIA_PLATFORMS).toContain("instagram");
    expect(SOCIAL_MEDIA_PLATFORMS).not.toContain("tiktok");
    expect(resolveSocialMediaArtifactKey("social.output")).toBe(
      SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
  });

  it("I — schema versions explicit; unsupported multi-asset not invented", () => {
    expect(socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output)).toBe(
      "unagency.social_media.output.v1",
    );
    const out = fixtureSocialMediaOutput();
    expect(out.multiAssetUnresolved).toBe(true);
    expect(out.captionUnresolved).toBe(true);
    expect(out.canvas?.coordinateSystem).toBe(SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM);
  });
});
