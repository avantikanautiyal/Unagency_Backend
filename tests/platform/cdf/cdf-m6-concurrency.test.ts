/**
 * CDF M6 hardening #2 — version allocation, concurrency, historical lineage.
 */

import {
  applyCdfTransition,
  applyTargetedRefinement,
  createArtifact,
  createVersion,
  createVersionWithCasRetry,
  CdfRefinementError,
  fixturePresentationDesignSystem,
  fixtureTenSlideDeck,
  getArtifact,
  getArtifactVersion,
  markApproved,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRefinementEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  type DeckSpec,
} from "../../../src/platform/cdf";

describe("CDF M6 hardening #2 — version allocation / concurrency", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
    resetCdfRefinementEngineForTests();
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "10-slide deck for concurrency tests.",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function seedDeckAtV4(sessionId: string) {
    const ds = createArtifact({
      organizationId: "org_m6c",
      projectId: "proj_m6c",
      userId: "u",
      sessionId,
      serviceId: "presentation",
      phaseId: "design-routes",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const deckData = fixtureTenSlideDeck(ds.artifact.artifactId);
    // Pin designSystemRef.version=1 for this suite (fixture defaults to 2)
    deckData.designSystemRef.version = 1;

    const deck = createArtifact({
      organizationId: "org_m6c",
      projectId: "proj_m6c",
      userId: "u",
      sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: deckData as never,
      provenance: {
        contextId: "ctx_m6c",
        contextHash: "hash_m6c",
      },
    });

    // Build HEAD=v4 with identifiable mutations per version
    for (let v = 1; v < 4; v++) {
      const prev = getArtifactVersion(deck.artifact.artifactId, v, {
        organizationId: "org_m6c",
        projectId: "proj_m6c",
      });
      const data = structuredClone(prev.data) as DeckSpec;
      const marker = data.slides
        .find((s) => s.id === "slide_01")!
        .elements.find((e) => e.id === "element_body_01");
      if (marker && marker.type === "text") {
        marker.content = `v${v + 1}_body_marker`;
      }
      // Distinct title on slide 9 only after v2 so historical refine from v2 lacks later markers
      if (v >= 2) {
        const t = data.slides
          .find((s) => s.id === "slide_09")!
          .elements.find((e) => e.id === "element_title_09");
        if (t && t.type === "text") t.content = `Introduced_at_v${v + 1}`;
      }
      createVersion({
        artifactId: deck.artifact.artifactId,
        expectedLatestVersion: v,
        organizationId: "org_m6c",
        projectId: "proj_m6c",
        data: data as never,
      });
    }

    const head = getArtifact(deck.artifact.artifactId, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    expect(head.latestVersion).toBe(4);
    return { deckId: deck.artifact.artifactId, dsId: ds.artifact.artifactId };
  }

  function refine(
    sessionId: string,
    opts: {
      artifactId: string;
      artifactVersion: number;
      rawInstruction: string;
      requestId?: string;
      expectedLatestVersion?: number;
      expectedSessionVersion?: number;
      runM4?: boolean;
      m4Requirements?: [];
    },
  ) {
    return applyTargetedRefinement({
      sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "proj_m6c",
      organizationId: "org_m6c",
      userId: "u",
      rawInstruction: opts.rawInstruction,
      artifactId: opts.artifactId,
      artifactVersion: opts.artifactVersion,
      expectedLatestVersion: opts.expectedLatestVersion,
      expectedSessionVersion: opts.expectedSessionVersion,
      requestId: opts.requestId,
      runM4: opts.runM4 ?? false,
      m4Requirements: opts.m4Requirements,
    });
  }

  it("A — concurrent HEAD refinements allocate unique versions (no duplicate v5)", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);

    const a = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "conc-a",
      expectedLatestVersion: 4,
    });
    const b = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Change the headline on slide 7 to 'Green Path'.",
      requestId: "conc-b",
      expectedLatestVersion: 4, // stale vs post-A head — CAS retry → v6
    });

    expect(a.status).toBe("applied");
    expect(b.status).toBe("applied");
    expect(a.newVersion).toBe(5);
    expect(b.newVersion).toBe(6);
    expect(a.newVersion).not.toBe(b.newVersion);

    const v5 = getArtifactVersion(deckId, 5, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const v6 = getArtifactVersion(deckId, 6, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    expect(v5.lineage.parentVersion).toBe(4);
    expect(v6.lineage.parentVersion).toBe(4);
    expect(
      v5.lineage.sourceArtifacts?.some(
        (s) => s.version === 4 && s.relationship === "refines",
      ),
    ).toBe(true);
    expect(
      v6.lineage.sourceArtifacts?.some(
        (s) => s.version === 4 && s.relationship === "refines",
      ),
    ).toBe(true);

    // Different creative data — neither overwrote the other
    const t5 = (v5.data as DeckSpec).slides
      .find((s) => s.id === "slide_07")!
      .elements.find((e) => e.id === "element_title_07")!;
    const t6 = (v6.data as DeckSpec).slides
      .find((s) => s.id === "slide_07")!
      .elements.find((e) => e.id === "element_title_07")!;
    expect(t5.style?.fontSize).toBe(32);
    expect(t6.type === "text" && t6.content).toBe("Green Path");
  });

  it("B — concurrent refinements of different historical sources get unique versions", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);

    const a = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 2,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "hist-a",
      expectedLatestVersion: 4,
    });
    const b = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 3,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "hist-b",
      expectedLatestVersion: 4,
    });

    expect(a.status).toBe("applied");
    expect(b.status).toBe("applied");
    const versions = [a.newVersion!, b.newVersion!].sort();
    expect(versions).toEqual([5, 6]);

    const vA = getArtifactVersion(deckId, a.newVersion!, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const vB = getArtifactVersion(deckId, b.newVersion!, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    expect(vA.lineage.parentVersion).toBe(2);
    expect(vB.lineage.parentVersion).toBe(3);
  });

  it("C/L/M — historical refine v2 while HEAD=v4 derives from v2 not v4", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);

    const v2 = getArtifactVersion(deckId, 2, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const v4 = getArtifactVersion(deckId, 4, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const v4Title9 = (v4.data as DeckSpec).slides
      .find((s) => s.id === "slide_09")!
      .elements.find((e) => e.id === "element_title_09")!;
    expect(v4Title9.type === "text" && v4Title9.content).toMatch(
      /Introduced_at_v/,
    );

    const result = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 2,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "from-v2",
    });
    expect(result.status).toBe("applied");
    expect(result.newVersion).toBe(5);
    expect(result.sourceVersion).toBe(2);

    const v5 = getArtifactVersion(deckId, 5, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    expect(v5.lineage.parentVersion).toBe(2);
    expect(
      v5.lineage.sourceArtifacts?.some(
        (s) => s.version === 2 && s.relationship === "refines",
      ),
    ).toBe(true);

    // Body marker from v2 chain, not later exclusive v4-only title mutation path
    const body = (v5.data as DeckSpec).slides
      .find((s) => s.id === "slide_01")!
      .elements.find((e) => e.id === "element_body_01")!;
    const v2body = (v2.data as DeckSpec).slides
      .find((s) => s.id === "slide_01")!
      .elements.find((e) => e.id === "element_body_01")!;
    expect(body).toEqual(v2body);

    const title9 = (v5.data as DeckSpec).slides
      .find((s) => s.id === "slide_09")!
      .elements.find((e) => e.id === "element_title_09")!;
    const v2title9 = (v2.data as DeckSpec).slides
      .find((s) => s.id === "slide_09")!
      .elements.find((e) => e.id === "element_title_09")!;
    expect(title9).toEqual(v2title9);
    expect(title9).not.toEqual(v4Title9);

    expect(getArtifact(deckId, { organizationId: "org_m6c", projectId: "proj_m6c" })
      .latestVersion).toBe(5);
  });

  it("D — branching lineage v2→v5→v6 (not collapsed to v4→v5→v6)", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);

    const r5 = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 2,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "branch-5",
    });
    expect(r5.newVersion).toBe(5);

    const r6 = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 5,
      rawInstruction: "Change the headline on slide 7 to 'Branch Tip'.",
      requestId: "branch-6",
    });
    expect(r6.newVersion).toBe(6);

    const v5 = getArtifactVersion(deckId, 5, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const v6 = getArtifactVersion(deckId, 6, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    expect(v5.lineage.parentVersion).toBe(2);
    expect(v6.lineage.parentVersion).toBe(5);
    // Linear HEAD chain still advanced; creative lineage is parentVersion/refines
    expect(v5.lineage.parentVersion).not.toBe(4);
  });

  it("E — concurrent duplicate idempotency → one version, same result", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);

    const a = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "dup-x",
    });
    const b = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "dup-x",
    });

    expect(a.status).toBe("applied");
    expect(b.status).toBe("applied");
    expect(a.newVersion).toBe(5);
    expect(b.newVersion).toBe(5);
    expect(b.idempotentReplay).toBe(true);
    expect(() =>
      getArtifactVersion(deckId, 6, {
        organizationId: "org_m6c",
        projectId: "proj_m6c",
      }),
    ).toThrow();
  });

  it("F — idempotency conflict on payload reuse", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "idem-conflict",
    });
    expect(() =>
      refine(session.sessionId, {
        artifactId: deckId,
        artifactVersion: 4,
        rawInstruction: "Change the headline on slide 7 to 'Other'.",
        requestId: "idem-conflict",
      }),
    ).toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it("G — session CAS conflict rejects stale refine", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    expect(() =>
      refine(session.sessionId, {
        artifactId: deckId,
        artifactVersion: 4,
        rawInstruction: "Make the title on slide 7 larger.",
        expectedSessionVersion: session.sessionVersion + 50,
      }),
    ).toThrow(/STALE_CONTEXT/);
  });

  it("H — artifact version conflict without retry", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    createVersion({
      artifactId: deckId,
      expectedLatestVersion: 4,
      organizationId: "org_m6c",
      projectId: "proj_m6c",
      data: getArtifactVersion(deckId, 4, {
        organizationId: "org_m6c",
        projectId: "proj_m6c",
      }).data as never,
    });
    expect(() =>
      createVersion({
        artifactId: deckId,
        expectedLatestVersion: 4,
        organizationId: "org_m6c",
        projectId: "proj_m6c",
        data: getArtifactVersion(deckId, 4, {
          organizationId: "org_m6c",
          projectId: "proj_m6c",
        }).data as never,
      }),
    ).toThrow(/ARTIFACT_VERSION_CONFLICT/);
  });

  it("I — M4 failed refinement does not consume a canonical version number", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    const ts = new Date().toISOString();
    const fail = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "proj_m6c",
      organizationId: "org_m6c",
      rawInstruction: "Make the title on slide 7 larger.",
      artifactId: deckId,
      artifactVersion: 4,
      runM4: true,
      m4Requirements: [
        {
          requirementId: "req_block",
          sessionId: session.sessionId,
          serviceId: "presentation",
          key: "slide_count",
          value: { kind: "number", value: 99 },
          displayValue: "99",
          category: "structure",
          priority: "explicit_current_user_instruction",
          provenance: {
            sourceInputId: "src",
            sourceType: "user_prompt",
            extractionMethod: "explicit",
            explicit: true,
            confidence: 1,
          },
          status: "active",
          confidence: 1,
          explicit: true,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      requestId: "m4-no-consume",
    });
    expect(fail.status).toBe("validation_failed");
    expect(fail.newVersion).toBeUndefined();
    expect(
      getArtifact(deckId, { organizationId: "org_m6c", projectId: "proj_m6c" })
        .latestVersion,
    ).toBe(4);

    const ok = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
      requestId: "m4-after-fail",
      m4Requirements: [],
      runM4: true,
    });
    expect(ok.status).toBe("applied");
    expect(ok.newVersion).toBe(5); // no hole reserved by failed A
  });

  it("J — successful refinement allocates unique next version", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    const r = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
    });
    expect(r.newVersion).toBe(5);
    expect(
      getArtifact(deckId, { organizationId: "org_m6c", projectId: "proj_m6c" })
        .latestVersion,
    ).toBe(5);
  });

  it("K — approved source remains creatively unchanged", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    markApproved(deckId, 4, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    });
    const before = structuredClone(
      getArtifactVersion(deckId, 4, {
        organizationId: "org_m6c",
        projectId: "proj_m6c",
      }).data,
    );
    const r = refine(session.sessionId, {
      artifactId: deckId,
      artifactVersion: 4,
      rawInstruction: "Make the title on slide 7 larger.",
    });
    expect(r.newVersion).toBe(5);
    expect(
      getArtifactVersion(deckId, 4, {
        organizationId: "org_m6c",
        projectId: "proj_m6c",
      }).data,
    ).toEqual(before);
  });

  it("CAS retry helper allocates contiguous unique versions", () => {
    const session = startSession();
    const { deckId } = seedDeckAtV4(session.sessionId);
    const base = getArtifactVersion(deckId, 4, {
      organizationId: "org_m6c",
      projectId: "proj_m6c",
    }).data;
    const a = createVersionWithCasRetry({
      artifactId: deckId,
      expectedLatestVersion: 4,
      organizationId: "org_m6c",
      projectId: "proj_m6c",
      data: base as never,
      lineageParentVersion: 4,
    });
    const b = createVersionWithCasRetry({
      artifactId: deckId,
      expectedLatestVersion: 4, // stale
      organizationId: "org_m6c",
      projectId: "proj_m6c",
      data: base as never,
      lineageParentVersion: 4,
    });
    expect(a.version.version).toBe(5);
    expect(b.version.version).toBe(6);
  });
});
