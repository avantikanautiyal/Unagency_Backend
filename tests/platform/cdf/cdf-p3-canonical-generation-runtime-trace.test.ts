/**
 * Phase 3 — Canonical generation context runtime trace + provider-boundary proof.
 * Exercises apply (prepass bridge) → DirectExecutionEngine → mocked transport.
 */

import {
  applyCdfTransition,
  assertCanonicalTraceCompleteness,
  assertCanonicalTraceConsistency,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  createVersion,
  detectCanonicalSectionsPresent,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getArtifactVersion,
  getCdfSession,
  getCanonicalGenerationTraceEvents,
  getLatestCanonicalTraceEvent,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";

const ORG = "org_p3_trace";
const PROJ = "proj_p3_trace";

const STORYLINE_MARKER = "CANONICAL_STORYLINE_MARKER_9F31";
const SLIDE_MARKER = "CANONICAL_SLIDE_CONTENT_MARKER_7A22";
const DESIGN_MARKER = "CANONICAL_DESIGN_SYSTEM_MARKER_4D19";
const END_MARKER = "CANONICAL_END_MARKER_TRUNCATION_PROOF_ZZ99";

function startBrief() {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "presentation",
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  if (!started.ok) throw new Error("start");
  const briefed = applyCdfTransition({
    action: "submit_brief",
    sessionId: started.value.session.sessionId,
    brief:
      "Create a 12-slide investor presentation. Audience: Series A. Tone: premium.",
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error("brief");
  return briefed.value.session;
}

function selectSource(session: ReturnType<typeof startBrief>) {
  const r = applyCdfTransition({
    action: "select_route",
    sessionId: session.sessionId,
    routeIndex: 2,
    routeTitle: "Start from Scratch",
    expectedVersion: session.sessionVersion,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.session;
}

/** Oversized storyline with identifiable end marker (truncation regression). */
function largeStorylineWithEndMarker(startMarker: string, endMarker: string) {
  const base = fixturePresentationStoryline();
  const pad = "PAD_".repeat(500);
  return {
    ...base,
    objective: `${startMarker} ${pad}`,
    narrativeStrategy: `${startMarker}_NARRATIVE ${pad}`,
    notes: `${startMarker}_NOTES ${pad}`,
    slides: [
      ...base.slides,
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `slide_extra_${i}`,
        order: 10 + i,
        title: `${startMarker}_SLIDE_${i}`,
        purpose: `Purpose ${i} ${pad.slice(0, 80)}`,
        keyMessage: `Key ${startMarker} ${i}`,
      })),
    ],
    truncationProofTail: endMarker,
  };
}

function approveStoryline(
  sessionIn: ReturnType<typeof startBrief>,
  data: Record<string, unknown>,
  requestId: string,
) {
  let session = sessionIn;
  const created = createArtifact({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: "storyline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    artifactType: "structured_doc",
    data,
    requestId,
  });
  markApproved(created.artifact.artifactId, created.version.version, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const approved = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "OLD_TRUNCATED_NOTE_ONLY",
    artifactId: created.artifact.artifactId,
    artifactVersion: created.version.version,
    expectedVersion: session.sessionVersion,
  });
  if (!approved.ok) throw new Error(approved.error.message);
  session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
    artifactId: created.artifact.artifactId,
    version: created.version.version,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId: created.artifact.artifactId,
    version: created.version.version,
  };
}

describe("Phase 3 Canonical Generation Runtime Trace", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCanonicalGenerationTracesForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("runtime — storyline→slide-content reaches provider with markers + sections", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStorylineWithEndMarker(STORYLINE_MARKER, END_MARKER) as unknown as Record<
        string,
        unknown
      >,
      "p3_story_sc",
    );

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content for this stage only.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_slide_content",
    });

    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");
    expect(proof.providerInvoked).toBe(true);
    expect(proof.dispatcherAttempts).toBeGreaterThan(0);
    expect(proof.apply.metadata.cdfCanonicalContextApplied).toBe(true);
    expect(typeof proof.apply.metadata.cdfCanonicalContextHash).toBe("string");

    expect(proof.providerPrompt).toContain(STORYLINE_MARKER);
    expect(proof.providerPrompt).toContain(END_MARKER);
    expect(proof.providerPrompt).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(proof.providerPrompt).toContain("===== REQUIREMENTS =====");
    expect(proof.providerPrompt).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(proof.providerPrompt).toContain("===== OUTPUT CONTRACT =====");
    expect(proof.providerPrompt.includes(STORYLINE_MARKER)).toBe(true);

    const sections = detectCanonicalSectionsPresent(proof.providerPrompt);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.requirements).toBe(true);
    expect(sections.upstreamArtifacts).toBe(true);
    expect(sections.outputContract).toBe(true);

    const compiled = getLatestCanonicalTraceEvent("cdf.generation_context.compiled");
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    expect(compiled?.event).toBe("cdf.generation_context.compiled");
    expect(boundary?.event).toBe("cdf.generation_context.provider_boundary");
    if (
      compiled?.event === "cdf.generation_context.compiled" &&
      boundary?.event === "cdf.generation_context.provider_boundary"
    ) {
      assertCanonicalTraceCompleteness({ compiled, boundary });
      assertCanonicalTraceConsistency({ compiled, boundary });
      expect(compiled.upstreamArtifacts.some((u) => u.version === pinned.version)).toBe(
        true,
      );
      expect(compiled.upstreamArtifacts[0]?.contentHash).toBeTruthy();
      expect(boundary.generationContextHash).toBe(compiled.generationContextHash);
    }
  });

  it("runtime — >1500 char truncation regression (end marker survives)", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStorylineWithEndMarker(STORYLINE_MARKER, END_MARKER) as unknown as Record<
        string,
        unknown
      >,
      "p3_trunc",
    );
    const jsonLen = JSON.stringify(
      getArtifactVersion(pinned.artifactId, pinned.version)!.data,
    ).length;
    expect(jsonLen).toBeGreaterThan(1500);

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_trunc",
    });
    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain(END_MARKER);
    expect(proof.providerPrompt.indexOf(END_MARKER)).toBeGreaterThan(1500);
  });

  it("runtime — exact version pin (v3 marker, not v4); no latest lookup", async () => {
    let session = selectSource(startBrief());
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: {
        ...fixturePresentationStoryline(),
        objective: "VERSION_ONE_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p3_v1",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (const marker of ["VERSION_TWO_MARKER", "VERSION_THREE_MARKER"]) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationStoryline(),
          objective: marker,
        } as unknown as Record<string, unknown>,
        requestId: `p3_${marker}`,
      });
      latest = next.version.version;
    }
    expect(latest).toBe(3);
    markApproved(artifactId, 3, { organizationId: ORG, projectId: PROJ });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "storyline ok",
      artifactId,
      artifactVersion: 3,
      expectedVersion: session.sessionVersion,
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(ap.value.session, {
      artifactId,
      version: 3,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    createVersion({
      artifactId,
      expectedLatestVersion: 3,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: "VERSION_FOUR_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p3_v4",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 3,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const latestSpy = jest.spyOn(artifactRepo, "getLatestArtifactVersion");
    const exactSpy = jest.spyOn(artifactRepo, "getArtifactVersion");

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Build slide content",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_exact_ver",
    });

    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain("VERSION_THREE_MARKER");
    expect(proof.providerPrompt).not.toContain("VERSION_FOUR_MARKER");
    expect(latestSpy).not.toHaveBeenCalled();
    expect(exactSpy).toHaveBeenCalled();
    const calls = exactSpy.mock.calls.filter((c) => c[0] === artifactId);
    expect(calls.some((c) => c[1] === 3)).toBe(true);
    expect(calls.every((c) => c[1] !== 4)).toBe(true);
    latestSpy.mockRestore();
    exactSpy.mockRestore();
  });

  it("runtime — missing dependency fails before provider", async () => {
    const session = selectSource(startBrief());
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_missing_dep",
    });

    expect(proof.apply.ok).toBe(false);
    if (proof.apply.ok) throw new Error("expected failure");
    expect(proof.apply.code).toMatch(/DEPENDENCY|ARTIFACT|CONTEXT/);
    expect(proof.providerInvoked).toBe(false);
    expect(proof.dispatcherAttempts).toBe(0);
    const failed = getLatestCanonicalTraceEvent("cdf.generation_context.failed");
    expect(failed?.event).toBe("cdf.generation_context.failed");
    if (failed?.event === "cdf.generation_context.failed") {
      expect(failed.providerInvoked).toBe(false);
      expect(failed.failureCode).toBeTruthy();
    }
  });

  it("runtime — flag OFF: canonical not applied; legacy path still reaches provider", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacyPrompt =
      "Approved upstream stages:\n- phase storyline · OLD_TRUNCATED_NOTE\nGenerate slides.";

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: legacyPrompt,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_flag_off",
    });

    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok) return;
    expect(proof.apply.skipped).toBe(true);
    expect(proof.apply.metadata.cdfCanonicalContextApplied).toBe(false);
    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain("OLD_TRUNCATED_NOTE");
    const skipped = getLatestCanonicalTraceEvent("cdf.generation_context.skipped");
    expect(skipped?.event).toBe("cdf.generation_context.skipped");
    if (skipped?.event === "cdf.generation_context.skipped") {
      expect(skipped.canonicalContextApplied).toBe(false);
      expect(skipped.reason).toBe("flag_off");
    }
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    expect(boundary?.event).toBe("cdf.generation_context.provider_boundary");
    if (boundary?.event === "cdf.generation_context.provider_boundary") {
      expect(boundary.canonicalContextApplied).toBe(false);
    }
  });

  it("runtime — CTI instruction retains full canonical sections", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: STORYLINE_MARKER,
      } as unknown as Record<string, unknown>,
      "p3_cti",
    );

    const cti = "Make the selected slide content more premium and concise.";
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content for this stage only.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: cti,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationalInstruction: cti,
      executionId: "exec_p3_cti",
    });

    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(proof.providerPrompt).toContain(cti);
    expect(proof.providerPrompt).toContain("===== REQUIREMENTS =====");
    expect(proof.providerPrompt).toContain("CDF PHASE");
    expect(proof.providerPrompt).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(proof.providerPrompt).toContain("===== OUTPUT CONTRACT =====");
    expect(proof.providerPrompt).toContain(STORYLINE_MARKER);
  });

  it("runtime — full-deck canonical upstream + PresentationRoutes + omit concepts", async () => {
    let session = selectSource(startBrief());
    const story = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: {
        ...fixturePresentationStoryline(),
        objective: STORYLINE_MARKER,
      } as unknown as Record<string, unknown>,
      requestId: "p3_fd_story",
    });
    markApproved(story.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    let cur = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId: story.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: session.sessionVersion,
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = upsertSessionArtifactRef(cur.value.session, {
      artifactId: story.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });

    const slides = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      artifactType: "structured_doc",
      data: {
        ...fixturePresentationSlideContent(),
        slides: [
          ...fixturePresentationSlideContent().slides,
          {
            id: "slide_canonical_only",
            order: 99,
            title: SLIDE_MARKER,
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: `${SLIDE_MARKER} Must appear in full-deck context`,
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p3_fd_slides",
    });
    markApproved(slides.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    cur = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId: slides.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: session.sessionVersion,
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: slides.artifact.artifactId,
      version: 1,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });

    const route = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "design-routes",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      artifactType: "config_choice",
      data: fixturePresentationDesignRoute() as unknown as Record<string, unknown>,
      requestId: "p3_fd_route",
    });
    markSelected(route.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: {
        ...fixturePresentationDesignSystem(),
        name: DESIGN_MARKER,
      } as unknown as Record<string, unknown>,
      requestId: "p3_fd_ds",
    });
    markApproved(ds.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });

    cur = applyCdfTransition({
      action: "select_route",
      sessionId: session.sessionId,
      routeIndex: 1,
      routeTitle: "Bold Executive",
      routeDesc: "Navy executive",
      artifactId: route.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: session.sessionVersion,
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = getCdfSession(session.sessionId)!;
    session = upsertSessionArtifactRef(session, {
      artifactId: slides.artifact.artifactId,
      version: 1,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: ds.artifact.artifactId,
      version: 1,
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      role: "selected",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: story.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Build the full presentation deck",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "full-deck",
        cdfServiceId: "presentation",
        service: "Presentations",
        outputKind: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_full_deck",
    });

    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) {
      throw new Error(`expected full-deck applied: ${JSON.stringify(proof.apply)}`);
    }
    expect(proof.providerInvoked).toBe(true);
    expect(proof.apply.metadata.cdfCanonicalFullDeck).toBe(true);
    expect(proof.apply.metadata.cdfOmitConceptsExpansion).toBe(true);
    expect(
      (proof.stampedMetadata.structuredOutput as { name?: string })?.name,
    ).toBe("PresentationRoutes");
    expect(proof.providerPrompt).toContain(SLIDE_MARKER);
    expect(proof.providerPrompt).toContain(DESIGN_MARKER);

    const compiled = getLatestCanonicalTraceEvent("cdf.generation_context.compiled");
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    if (
      compiled?.event === "cdf.generation_context.compiled" &&
      boundary?.event === "cdf.generation_context.provider_boundary"
    ) {
      assertCanonicalTraceConsistency({ compiled, boundary });
      expect(compiled.canonicalFullDeck).toBe(true);
      expect(
        compiled.upstreamArtifacts.some(
          (u) =>
            u.artifactId === slides.artifact.artifactId && u.version === 1,
        ),
      ).toBe(true);
      expect(
        compiled.upstreamArtifacts.some(
          (u) => u.artifactId === ds.artifact.artifactId && u.version === 1,
        ),
      ).toBe(true);
    }
  });

  it("runtime — compile↔provider-boundary hash + upstream consistency", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: STORYLINE_MARKER,
      } as unknown as Record<string, unknown>,
      "p3_consistency",
    );

    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p3_consistency",
    });
    expect(proof.providerInvoked).toBe(true);

    const compiled = getLatestCanonicalTraceEvent("cdf.generation_context.compiled");
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    expect(compiled?.event).toBe("cdf.generation_context.compiled");
    expect(boundary?.event).toBe("cdf.generation_context.provider_boundary");
    if (
      compiled?.event !== "cdf.generation_context.compiled" ||
      boundary?.event !== "cdf.generation_context.provider_boundary"
    ) {
      throw new Error("missing traces");
    }
    assertCanonicalTraceConsistency({ compiled, boundary });
    assertCanonicalTraceCompleteness({ compiled, boundary });
    expect(compiled.executionId).toBe("exec_p3_consistency");
    expect(boundary.executionId).toBe("exec_p3_consistency");
    expect(compiled.cdfSessionId).toBe(pinned.session.sessionId);
    expect(boundary.cdfSessionId).toBe(pinned.session.sessionId);
    expect(compiled.cdfPhaseId).toBe("slide-content");
    expect(boundary.cdfPhaseId).toBe("slide-content");
    expect(getCanonicalGenerationTraceEvents().length).toBeGreaterThanOrEqual(2);
  });
});
