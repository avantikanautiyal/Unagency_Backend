/**
 * CDF M3C — Generation → Canonical Artifact boundary tests.
 */

import {
  applyCdfTransition,
  assertArtifactIdIsNotVaultAsset,
  getArtifactVersion,
  getLatestArtifactVersion,
  ingestGenerationCompletion,
  markApproved,
  normalizePresentationDeck,
  normalizePresentationDesignRoute,
  normalizePresentationDesignRoutes,
  normalizePresentationDesignSystem,
  normalizePresentationSlideContent,
  normalizePresentationStoryline,
  normalizeToPresentationData,
  PRESENTATION_ARTIFACT_KEYS,
  resolveArtifactTarget,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  CdfGenerationArtifactError,
  GOLDEN_LEGACY_STORYLINE,
  GOLDEN_LEGACY_SLIDE_CONTENT,
  GOLDEN_LEGACY_ROUTES,
  GOLDEN_LEGACY_DESIGN_SYSTEM,
  GOLDEN_LEGACY_SOURCE,
  GOLDEN_PROVIDER_WRAPPED_ROUTES,
  CDF_M3C_GENERATION_PATH_AUDIT,
  createArtifact,
  fixturePresentationDesignSystem,
} from "../../../src/platform/cdf";

describe("CDF M3C Generation → Artifact Boundary", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  function startPresentationSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_a",
      projectId: "proj_a",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "12-slide investor deck navy green",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  it("A — target resolution from phase contract", () => {
    expect(
      resolveArtifactTarget({ serviceId: "presentation", phaseId: "storyline" })
        .artifactKey,
    ).toBe(PRESENTATION_ARTIFACT_KEYS.storyline);
    expect(
      resolveArtifactTarget({
        serviceId: "presentation",
        phaseId: "slide-content",
      }).artifactKey,
    ).toBe(PRESENTATION_ARTIFACT_KEYS.slideContent);
    expect(
      resolveArtifactTarget({
        serviceId: "presentation",
        phaseId: "design-routes",
      }).artifactKey,
    ).toBe(PRESENTATION_ARTIFACT_KEYS.designRoute);
    expect(
      resolveArtifactTarget({ serviceId: "presentation", phaseId: "select" })
        .artifactKey,
    ).toBe(PRESENTATION_ARTIFACT_KEYS.designSystem);
    expect(
      resolveArtifactTarget({ serviceId: "presentation", phaseId: "full-deck" })
        .artifactKey,
    ).toBe(PRESENTATION_ARTIFACT_KEYS.deck);
    expect(() =>
      resolveArtifactTarget({
        serviceId: "presentation",
        phaseId: "no-such-phase",
      }),
    ).toThrow(/ARTIFACT_TARGET_UNRESOLVED/);
  });

  it("B — normalize legacy outputs to canonical schemas", () => {
    const story = normalizePresentationStoryline(GOLDEN_LEGACY_STORYLINE);
    expect(story.slides).toHaveLength(3);
    expect(story.slides[0]!.id).toBe("slide_01");

    const content = normalizePresentationSlideContent(GOLDEN_LEGACY_SLIDE_CONTENT);
    expect(content.slides[1]!.blocks.some((b) => b.type === "bullets")).toBe(true);

    const routes = normalizePresentationDesignRoutes(GOLDEN_LEGACY_ROUTES);
    expect(routes).toHaveLength(3);
    expect(routes[1]!.name).toBe("Bold Executive");

    const ds = normalizePresentationDesignSystem(GOLDEN_LEGACY_DESIGN_SYSTEM, {
      designRouteRef: {
        artifactId: "cdfart_route_fixture_01",
        version: 1,
      },
    });
    expect(ds.fontRoles.title.family).toBe("Inter");

    const deck = normalizePresentationDeck(GOLDEN_LEGACY_ROUTES, {
      designSystemRef: {
        artifactId: "cdfart_ds_fixture_01",
        version: 1,
      },
      routeIndex: 1,
    });
    expect(deck.slides).toHaveLength(3);
    expect(deck.metadata.dimensions.coordinateSystem).toBe("slide_normalized");
    expect(deck.designSystemRef.artifactKey).toBe(
      PRESENTATION_ARTIFACT_KEYS.designSystem,
    );
  });

  it("C — invalid generation output fails", () => {
    expect(() =>
      normalizePresentationStoryline({ objective: "x" }),
    ).toThrow(/ARTIFACT_NORMALIZATION_FAILED|slides/);
    expect(() => normalizePresentationStoryline(null)).toThrow(
      /GENERATION_OUTPUT_MISSING|MALFORMED/,
    );
    expect(() =>
      normalizePresentationDeck(
        { routes: [{ title: "A", slides: [] }] },
        {
          designSystemRef: { artifactId: "cdfart_x", version: 1 },
        },
      ),
    ).toThrow(/slides/);
    expect(() =>
      normalizePresentationDeck(GOLDEN_LEGACY_ROUTES, {
        designSystemRef: { artifactId: "exec_not_art", version: 1 },
      }),
    ).toThrow(/designSystemRef/);
    const bad = structuredClone(GOLDEN_LEGACY_ROUTES);
    (bad.routes[0] as { slides: Array<{ visualCue?: string }> }).slides[0]!.visualCue =
      undefined;
    // still ok — visualCue optional
    expect(
      normalizePresentationDeck(bad, {
        designSystemRef: { artifactId: "cdfart_x", version: 1 },
        routeIndex: 0,
      }).slides.length,
    ).toBeGreaterThan(0);
  });

  it("D — provider wrappers normalize equivalently", () => {
    const a = normalizePresentationDesignRoutes(GOLDEN_LEGACY_ROUTES);
    const b = normalizePresentationDesignRoutes(GOLDEN_PROVIDER_WRAPPED_ROUTES);
    expect(b.map((r) => r.name)).toEqual(a.map((r) => r.name));
    expect(b[0]!.routeId).toBe(a[0]!.routeId);
  });

  it("E/F — provenance + M3A persistence", () => {
    const session = startPresentationSession();
    const result = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      projectId: "proj_a",
      organizationId: "org_a",
      executionId: "exec_story_1",
      expectedSessionVersion: session.sessionVersion,
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      contextId: "ctx_1",
      contextHash: "hash_1",
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      sourceInputIds: ["src_1"],
      requirements: [],
    });
    expect(result.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.storyline);
    expect(result.artifactId).not.toBe("exec_story_1");
    assertArtifactIdIsNotVaultAsset(result.artifactId);
    const version = getArtifactVersion(result.artifactId, result.artifactVersion);
    expect(version.provenance.executionId).toBe("exec_story_1");
    expect(version.provenance.contextId).toBe("ctx_1");
    expect(version.provenance.contextHash).toBe("hash_1");
    expect(version.provenance.activeBriefVersion).toBe(session.activeBriefVersion);
    expect(version.data.slides).toBeDefined();
  });

  it("G/H — versioning + approved immutability (new version)", () => {
    const session = startPresentationSession();
    const v1 = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      executionId: "exec_s_v1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      requirements: [],
    });
    markApproved(v1.artifactId, 1);
    const v2 = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      executionId: "exec_s_v2",
      expectedSessionVersion: session.sessionVersion,
      parentArtifactId: v1.artifactId,
      rawOutput: {
        ...GOLDEN_LEGACY_STORYLINE,
        objective: "Updated objective",
      },
      requirements: [],
    });
    expect(v2.artifactVersion).toBe(2);
    expect(getArtifactVersion(v1.artifactId, 1).data.objective).toBe(
      "Secure Series A interest",
    );
    expect(getLatestArtifactVersion(v1.artifactId).version).toBe(2);
  });

  it("I — stale generation rejected", () => {
    const session = startPresentationSession();
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "presentation",
        phaseId: "storyline",
        expectedSessionVersion: session.sessionVersion - 1,
        rawOutput: GOLDEN_LEGACY_STORYLINE,
      requirements: [],
      }),
    ).toThrow(/GENERATION_CONTEXT_STALE/);
  });

  it("J — idempotent completion", () => {
    const session = startPresentationSession();
    const a = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      executionId: "exec_idem_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      requirements: [],
    });
    const b = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      executionId: "exec_idem_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      requirements: [],
    });
    expect(b.idempotentReplay).toBe(true);
    expect(b.artifactId).toBe(a.artifactId);
    expect(b.artifactVersion).toBe(a.artifactVersion);
  });

  it("K — asset identity: exec/cdfart rejected as vault", () => {
    expect(() =>
      normalizePresentationDesignRoute(
        { title: "R", representativeAssetIds: ["exec_abc"] },
      ),
    ).toThrow(/ARTIFACT_ASSET_REFERENCE_INVALID/);
    expect(() =>
      normalizePresentationDeck(GOLDEN_LEGACY_ROUTES, {
        designSystemRef: { artifactId: "cdfart_ds", version: 1 },
        vaultAssetIds: ["cdfart_not_vault"],
      }),
    ).toThrow(/ARTIFACT_ASSET_REFERENCE_INVALID/);
  });

  it("L — path audit documents M7 wiring + remaining legacy gaps", () => {
    expect(CDF_M3C_GENERATION_PATH_AUDIT.length).toBeGreaterThan(3);
    expect(
      CDF_M3C_GENERATION_PATH_AUDIT.some((r) => r.status === "legacy_explicit"),
    ).toBe(true);
    expect(
      CDF_M3C_GENERATION_PATH_AUDIT.some((r) => r.status === "m7_wired"),
    ).toBe(true);
  });

  it("golden pipeline: routes → system → deck via ingest", () => {
    const session = startPresentationSession();
    const route = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "design-routes",
      executionId: "exec_route_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_ROUTES,
      routeIndex: 1,
      requirements: [],
    });
    expect(route.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.designRoute);

    const system = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      executionId: "exec_sys_1",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_DESIGN_SYSTEM,
      designRouteRef: {
        artifactId: route.artifactId,
        version: route.artifactVersion,
      },
      requirements: [],
    });
    expect(system.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.designSystem);

    const deck = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      executionId: "exec_deck_1",
      expectedSessionVersion: session.sessionVersion,
      contextId: "ctx_deck",
      contextHash: "hash_deck",
      rawOutput: GOLDEN_LEGACY_ROUTES,
      routeIndex: 1,
      designSystemRef: {
        artifactId: system.artifactId,
        version: system.artifactVersion,
      },
      vaultAssetIds: ["507f1f77bcf86cd799439011"],
      sourceArtifacts: [
        {
          artifactId: system.artifactId,
          version: system.artifactVersion,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          relationship: "uses",
        },
      ],
      requirements: [],
    });
    expect(deck.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.deck);
    const data = getArtifactVersion(deck.artifactId, deck.artifactVersion).data;
    expect(data.designSystemRef).toMatchObject({
      artifactId: system.artifactId,
      version: 1,
    });
    expect(
      (data.slides as Array<{ elements: Array<{ type: string }> }>)[1]!.elements.some(
        (e) => e.type === "image",
      ),
    ).toBe(true);
  });

  it("source + slide-content ingest", () => {
    const session = startPresentationSession();
    const src = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "source",
      executionId: "exec_src",
      expectedSessionVersion: session.sessionVersion,
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      rawOutput: GOLDEN_LEGACY_SOURCE,
      requirements: [],
    });
    expect(src.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.source);

    const sc = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "slide-content",
      executionId: "exec_sc",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: GOLDEN_LEGACY_SLIDE_CONTENT,
      requirements: [],
    });
    expect(sc.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.slideContent);
  });

  it("does not invent creative content for empty storyline", () => {
    expect(() =>
      normalizeToPresentationData(PRESENTATION_ARTIFACT_KEYS.storyline, {
        audience: "investors",
      }),
    ).toThrow(CdfGenerationArtifactError);
  });

  it("M3B fixture design-system still usable as seed", () => {
    const ds = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    expect(ds.artifact.artifactId.startsWith("cdfart_")).toBe(true);
  });
});
