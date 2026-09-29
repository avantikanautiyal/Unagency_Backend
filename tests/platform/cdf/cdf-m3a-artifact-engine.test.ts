/**
 * CDF M3A — Canonical Artifact Engine tests.
 */

import {
  applyCdfTransition,
  assertArtifactIdIsNotVaultAsset,
  assertExecutionIsNotArtifactId,
  canTransitionArtifactStatus,
  createArtifact,
  createArtifactFromCandidate,
  createVersion,
  getApprovedArtifactVersion,
  getArtifact,
  getArtifactLineage,
  getArtifactVersion,
  getLatestArtifactVersion,
  getSelectedArtifactVersion,
  getSupportedRepresentations,
  isCdfCanonicalArtifactId,
  isVaultAssetObjectIdShape,
  markApproved,
  markSelected,
  rejectMutableUpdate,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  validateArtifactData,
  CdfArtifactError,
} from "../../../src/platform/cdf";

describe("CDF M3A Artifact Engine", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  const baseCreate = (
    overrides: Partial<Parameters<typeof createArtifact>[0]> = {},
  ) =>
    createArtifact({
      sessionId: "sess_1",
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "proj_a",
      organizationId: "org_a",
      /** Generic key — Presentation schemas are M3B (key-specific). */
      artifactKey: "test.deck",
      artifactType: "deck",
      schemaVersion: "1",
      data: { slides: [], title: "Deck v1" },
      ...overrides,
    });

  it("A/B/C/D — create, retrieve artifact, exact version, latest", () => {
    const { artifact, version } = baseCreate();
    expect(isCdfCanonicalArtifactId(artifact.artifactId)).toBe(true);
    expect(version.version).toBe(1);
    expect(getArtifact(artifact.artifactId).artifactId).toBe(artifact.artifactId);
    expect(getArtifactVersion(artifact.artifactId, 1).data.title).toBe("Deck v1");
    expect(getLatestArtifactVersion(artifact.artifactId).version).toBe(1);
  });

  it("E/F — create v2 from v1; v1 creative data immutable", () => {
    const { artifact } = baseCreate();
    const v1Data = structuredClone(getArtifactVersion(artifact.artifactId, 1).data);
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { slides: [], title: "Deck v2" },
    });
    expect(getArtifactVersion(artifact.artifactId, 1).data).toEqual(v1Data);
    expect(getLatestArtifactVersion(artifact.artifactId).data.title).toBe("Deck v2");
    expect(getArtifactVersion(artifact.artifactId, 1).status).toBe("superseded");
  });

  it("G/H/AB/AC — approved v1 immutable; v2 after approval", () => {
    const { artifact } = baseCreate();
    markApproved(artifact.artifactId, 1);
    const v1 = getArtifactVersion(artifact.artifactId, 1);
    expect(v1.status).toBe("approved");
    expect(() => rejectMutableUpdate()).toThrow(CdfArtifactError);
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { slides: [], title: "Deck v2 after approve" },
    });
    expect(getArtifactVersion(artifact.artifactId, 1).data.title).toBe("Deck v1");
    expect(getApprovedArtifactVersion(artifact.artifactId)?.version).toBe(1);
    expect(getLatestArtifactVersion(artifact.artifactId).version).toBe(2);
    expect(getLatestArtifactVersion(artifact.artifactId).status).toBe("candidate");
  });

  it("I/J/K — approval and selection reference exact versions; select ≠ approve", () => {
    const { artifact } = baseCreate();
    markSelected(artifact.artifactId, 1);
    expect(getSelectedArtifactVersion(artifact.artifactId)?.version).toBe(1);
    expect(getApprovedArtifactVersion(artifact.artifactId)).toBeNull();
    expect(getArtifact(artifact.artifactId).approvedVersion).toBeUndefined();
    markApproved(artifact.artifactId, 1);
    expect(getApprovedArtifactVersion(artifact.artifactId)?.version).toBe(1);
  });

  it("L/M/AD — supersession preserves history and lineage", () => {
    const { artifact } = baseCreate();
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { slides: [], title: "v2" },
    });
    const lineage = getArtifactLineage(artifact.artifactId);
    expect(lineage.versions).toHaveLength(2);
    expect(lineage.versions[1]!.lineage.parentVersion).toBe(1);
    expect(getArtifactVersion(artifact.artifactId, 1).status).toBe("superseded");
  });

  it("N — cross-artifact refs point to exact versions", () => {
    const story = createArtifact({
      sessionId: "sess_1",
      serviceId: "presentation",
      phaseId: "storyline",
      projectId: "proj_a",
      organizationId: "org_a",
      artifactKey: "test.storyline",
      artifactType: "text_doc",
      data: { body: "story" },
    });
    const deck = createArtifact({
      sessionId: "sess_1",
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "proj_a",
      organizationId: "org_a",
      artifactKey: "test.deck",
      artifactType: "deck",
      data: { slides: [] },
      sourceArtifacts: [
        {
          artifactId: story.artifact.artifactId,
          version: 1,
          artifactKey: "test.storyline",
          relationship: "uses",
        },
      ],
    });
    expect(deck.version.lineage.sourceArtifacts[0]!.version).toBe(1);
    expect(() =>
      createArtifact({
        sessionId: "sess_1",
        serviceId: "presentation",
        phaseId: "full-deck",
        artifactKey: "test.deck",
        artifactType: "deck",
        data: { slides: [] },
        sourceArtifacts: [
          {
            artifactId: story.artifact.artifactId,
            version: 99,
            artifactKey: "test.storyline",
            relationship: "uses",
          },
        ],
      }),
    ).toThrow(/ARTIFACT_REFERENCE_INVALID|Referenced artifact/);
  });

  it("O/P/Q/R/S — provenance retained; execution ≠ artifact id", () => {
    const { artifact, version } = createArtifactFromCandidate({
      executionId: "exec_abc123",
      contextId: "ctx_1",
      contextHash: "hash_1",
      activeBriefId: "brief_1",
      activeBriefVersion: 2,
      sessionVersion: 3,
      sessionId: "sess_1",
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "proj_a",
      organizationId: "org_a",
      artifactKey: "test.deck",
      artifactType: "deck",
      schemaVersion: "1",
      data: { slides: [{ id: "s1" }] },
      sourceInputIds: ["src_1"],
      requestId: "cand_req_1",
    });
    expect(version.provenance.executionId).toBe("exec_abc123");
    expect(version.provenance.contextId).toBe("ctx_1");
    expect(version.provenance.contextHash).toBe("hash_1");
    expect(version.provenance.activeBriefId).toBe("brief_1");
    expect(version.provenance.activeBriefVersion).toBe(2);
    expect(version.provenance.sourceInputIds).toEqual(["src_1"]);
    expect(artifact.artifactId).not.toBe("exec_abc123");
    assertExecutionIsNotArtifactId("exec_abc123", artifact.artifactId);
    expect(() =>
      assertExecutionIsNotArtifactId(artifact.artifactId, artifact.artifactId),
    ).toThrow(/ARTIFACT_IDENTITY_COLLISION/);
  });

  it("T — artifact UUID cannot be used as Vault asset id", () => {
    const { artifact } = baseCreate();
    expect(isVaultAssetObjectIdShape(artifact.artifactId)).toBe(false);
    assertArtifactIdIsNotVaultAsset(artifact.artifactId);
    expect(() => assertArtifactIdIsNotVaultAsset("507f1f77bcf86cd799439011")).toThrow();
  });

  it("U/V — schema validation rejects malformed / unknown schema", () => {
    expect(() =>
      validateArtifactData({
        artifactType: "deck",
        schemaVersion: "1",
        data: { slides: "not-array" } as unknown as Record<string, unknown>,
      }),
    ).toThrow(/ARTIFACT_SCHEMA_INVALID|slides/);
    expect(() =>
      validateArtifactData({
        artifactType: "deck",
        schemaVersion: "99",
        data: {},
      }),
    ).toThrow(/ARTIFACT_SCHEMA_NOT_FOUND/);
  });

  it("W — invalid lifecycle transition rejected", () => {
    expect(canTransitionArtifactStatus("superseded", "approved")).toBe(false);
    const { artifact } = baseCreate();
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { slides: [], title: "v2" },
    });
    expect(() => markApproved(artifact.artifactId, 1)).toThrow(
      /ARTIFACT_INVALID_TRANSITION/,
    );
  });

  it("X — version concurrency conflict", () => {
    const { artifact } = baseCreate();
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { slides: [], title: "A" },
    });
    expect(() =>
      createVersion({
        artifactId: artifact.artifactId,
        expectedLatestVersion: 1,
        data: { slides: [], title: "B" },
      }),
    ).toThrow(/ARTIFACT_VERSION_CONFLICT/);
  });

  it("Y — duplicate creation request is idempotent", () => {
    const a = baseCreate({ requestId: "idem_1" });
    const b = baseCreate({ requestId: "idem_1" });
    expect(b.artifact.artifactId).toBe(a.artifact.artifactId);
    expect(b.version.version).toBe(1);
  });

  it("Z/AA — wrong tenant cannot retrieve or mutate", () => {
    const { artifact } = baseCreate({
      organizationId: "org_a",
      projectId: "proj_a",
    });
    expect(() =>
      getArtifact(artifact.artifactId, { organizationId: "org_other" }),
    ).toThrow(/ARTIFACT_OWNERSHIP_INVALID/);
    expect(() =>
      createVersion({
        artifactId: artifact.artifactId,
        expectedLatestVersion: 1,
        data: { slides: [] },
        organizationId: "org_other",
        projectId: "proj_a",
      }),
    ).toThrow(/ARTIFACT_OWNERSHIP_INVALID/);
  });

  it("AE/AF/AG/AH/AI — session refs + SM approve/select exact version; SM does not own payload", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_a",
      projectId: "proj_a",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    let session = started.value.session;
    const config = started.value.config;

    const briefed = applyCdfTransition({
      sessionId: session.sessionId,
      action: "submit_brief",
      brief: "12-slide investor deck navy green",
      expectedVersion: session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    session = briefed.value.session;

    // Source is routes — select with canonical artifact (selected ≠ approved in engine)
    expect(session.phaseId).toBe("source");
    const { fixturePresentationSource, fixturePresentationStoryline } =
      require("../../../src/platform/cdf/artifacts/presentation/fixtures") as typeof import("../../../src/platform/cdf/artifacts/presentation/fixtures");
    const sourceArt = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "source",
      projectId: "proj_a",
      organizationId: "org_a",
      artifactKey: "presentation.source",
      artifactType: "config_choice",
      data: fixturePresentationSource() as unknown as Record<string, unknown>,
    });
    const sel = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 2,
      artifactId: sourceArt.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: "presentation.source",
      expectedVersion: session.sessionVersion,
    });
    expect(sel.ok).toBe(true);
    if (!sel.ok) throw new Error(String(sel.error));
    session = sel.value.session;
    expect(
      session.selectedArtifacts?.some(
        (r) =>
          r.artifactId === sourceArt.artifact.artifactId && r.version === 1,
      ),
    ).toBe(true);
    expect(getSelectedArtifactVersion(sourceArt.artifact.artifactId)?.version).toBe(1);
    // Selection does not imply Artifact Engine approval
    expect(getApprovedArtifactVersion(sourceArt.artifact.artifactId)).toBeNull();

    // Storyline is text-approval — approve with exact storyline artifact
    expect(session.phaseId).toBe("storyline");
    const story = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      projectId: "proj_a",
      organizationId: "org_a",
      artifactKey: "presentation.storyline",
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
    });
    const beforePhase = session.phaseId;
    const ap = applyCdfTransition({
      sessionId: session.sessionId,
      action: "approve",
      artifactId: story.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: "presentation.storyline",
      expectedVersion: session.sessionVersion,
    });
    expect(ap.ok).toBe(true);
    if (!ap.ok) throw new Error(String(ap.error));
    session = ap.value.session;
    expect(
      session.approvedArtifacts?.some(
        (r) => r.artifactId === story.artifact.artifactId && r.version === 1,
      ),
    ).toBe(true);
    expect(getApprovedArtifactVersion(story.artifact.artifactId)?.version).toBe(1);
    // AH: state machine advanced phase — Artifact Engine did not control that
    expect(session.phaseId).not.toBe(beforePhase);
    // AI: session stores refs only (no creative payload)
    const ref = session.approvedArtifacts!.find(
      (r) => r.artifactId === story.artifact.artifactId,
    )!;
    expect((ref as { data?: unknown }).data).toBeUndefined();
    expect(config.phases.some((p) => p.id === "storyline")).toBe(true);
  });

  it("Presentation fixture — presentation.deck uses M3B DeckSpec when key-specific", () => {
    const {
      fixturePresentationDeck,
      fixturePresentationDesignSystem,
    } = require("../../../src/platform/cdf/artifacts/presentation/fixtures");
    const ds = createArtifact({
      sessionId: "sess_pres",
      serviceId: "presentation",
      phaseId: "select",
      artifactKey: "presentation.design-system",
      artifactType: "structured_doc",
      schemaVersion: "1",
      data: fixturePresentationDesignSystem(),
    });
    const { artifact, version } = createArtifact({
      sessionId: "sess_pres",
      serviceId: "presentation",
      phaseId: "full-deck",
      artifactKey: "presentation.deck",
      artifactType: "deck",
      schemaVersion: "1",
      data: fixturePresentationDeck(ds.artifact.artifactId),
    });
    expect(artifact.artifactKey).toBe("presentation.deck");
    expect(artifact.artifactType).toBe("deck");
    expect(version.schemaVersion).toBe("1");
    const nextData = fixturePresentationDeck(ds.artifact.artifactId);
    nextData.metadata.title = "Acme Series A v2";
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: nextData,
    });
    markApproved(artifact.artifactId, 2);
    expect(getApprovedArtifactVersion(artifact.artifactId)?.version).toBe(2);
    expect(getArtifactLineage(artifact.artifactId).versions[0]!.lineage).toBeDefined();
    expect(getSupportedRepresentations("deck", "1")).toContain("pptx");
  });

  it("does not invent DeckState / Presentation runtime migration", () => {
    // Guard: no DeckState module / no runtime Presentation migration package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require("../../../src/platform/cdf/artifacts/deck-state")).toThrow();
  });
});
