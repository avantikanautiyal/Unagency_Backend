/**
 * CDF M7 hardening — acceptance gate, design-system on select, exact deps, e2e.
 */

import {
  applyCdfTransition,
  applyTargetedRefinement,
  ensureDesignSystemOnSelect,
  getArtifactVersion,
  getRenderedFile,
  httpRenderArtifact,
  ingestGenerationCompletion,
  markApproved,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRefinementEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfRenderingForTests,
  resetCdfSessionsForTests,
  setCdfRenderedBlobStorage,
  shouldSkipLegacyPresentationExport,
  tryIngestPresentationCdfCompletion,
  CDF_PRESENTATION_RUNTIME_VERSION,
  GOLDEN_LEGACY_ROUTES,
  GOLDEN_LEGACY_STORYLINE,
  GOLDEN_LEGACY_SLIDE_CONTENT,
  CdfGenerationArtifactError,
  listArtifactVersions,
  upsertSessionArtifactRef,
  saveCdfSession,
  getCdfSession,
} from "../../../src/platform/cdf";
import { InMemoryBlobStorage as MemBlob } from "../../../src/platform/persistence/storage/in-memory-blob-storage";
import type { CdfRequirement } from "../../../src/platform/cdf/requirements/types";

describe("CDF M7 hardening — Presentation canonical runtime", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
    resetCdfRefinementEngineForTests();
    resetCdfRenderingForTests();
    setCdfRenderedBlobStorage(new MemBlob());
    delete process.env.CDF_PRESENTATION_FORCE_LEGACY_EXPORT;
    delete process.env.CDF_PRESENTATION_SKIP_LEGACY_EXPORT;
  });

  function startAndBrief(brief = "Build an investor presentation for Acme.") {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: started.value.session.sessionId,
      brief,
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  /** source(select) → storyline(approve) → slide-content(approve) → design-routes */
  function advanceToDesignRoutes(session: ReturnType<typeof startAndBrief>) {
    let cur = session;
    const sourceSelect = applyCdfTransition({
      action: "select_route",
      sessionId: cur.sessionId,
      routeIndex: 2,
      routeTitle: "Start from Scratch",
      expectedVersion: cur.sessionVersion,
    });
    if (!sourceSelect.ok) throw new Error(sourceSelect.error.message);
    cur = sourceSelect.value.session;
    expect(cur.phaseId).toBe("storyline");

    for (const _ of ["storyline", "slide-content"] as const) {
      const r = applyCdfTransition({
        action: "approve",
        sessionId: cur.sessionId,
        expectedVersion: cur.sessionVersion,
      });
      if (!r.ok) throw new Error(r.error.message);
      cur = r.value.session;
    }
    expect(cur.phaseId).toBe("design-routes");
    return cur;
  }

  function failingSlideCountReq(sessionId: string): CdfRequirement[] {
    const ts = new Date().toISOString();
    return [
      {
        requirementId: "req_slide_count_fail",
        sessionId,
        serviceId: "presentation",
        key: "slide_count",
        displayValue: "99",
        category: "quantity",
        priority: "explicit_current_user_instruction",
        provenance: {
          sourceInputId: "src_test",
          sourceType: "user_prompt",
          extractionMethod: "explicit",
          explicit: true,
          confidence: 1,
        },
        status: "active",
        confidence: 1,
        explicit: true,
        value: { kind: "number", value: 99 },
        createdAt: ts,
        updatedAt: ts,
      },
    ];
  }

  it("A/B — M4 failure → no canonical ArtifactVersion / no cdf attach", () => {
    const session = startAndBrief();
    const missing = tryIngestPresentationCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
      },
      rawOutput: GOLDEN_LEGACY_ROUTES,
      executionId: "exec_m4_miss",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(missing?.kind).toBe("dependency_missing");

    // Storyline with impossible slide-count requirement → validation_failed, no artifact
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "presentation",
        phaseId: "storyline",
        organizationId: "org_m7h",
        projectId: "proj_m7h",
        rawOutput: GOLDEN_LEGACY_STORYLINE,
        expectedSessionVersion: session.sessionVersion,
        activeBriefId: session.activeBriefId,
        activeBriefVersion: session.activeBriefVersion,
        executionId: "exec_story_fail",
        requirements: failingSlideCountReq(session.sessionId),
      }),
    ).toThrow(/ARTIFACT_VALIDATION_FAILED/);

    // Prove no storyline artifact was persisted for that execution idempotency key
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "presentation",
        phaseId: "storyline",
        organizationId: "org_m7h",
        projectId: "proj_m7h",
        rawOutput: GOLDEN_LEGACY_STORYLINE,
        expectedSessionVersion: session.sessionVersion,
        executionId: "exec_story_fail",
        requirements: failingSlideCountReq(session.sessionId),
      }),
    ).toThrow(/ARTIFACT_VALIDATION_FAILED/);
  });

  it("C — M4 review_required is accepted (not failed, not auto-approved)", () => {
    const session = startAndBrief();
    const ts = new Date().toISOString();
    const story = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      expectedSessionVersion: session.sessionVersion,
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      executionId: "exec_story_ok",
      requirements: [
        {
          requirementId: "req_tone",
          sessionId: session.sessionId,
          serviceId: "presentation",
          key: "tone",
          displayValue: "confident",
          category: "tone",
          priority: "ai_inference",
          provenance: {
            sourceInputId: "src_test",
            sourceType: "user_prompt",
            extractionMethod: "ai_inferred",
            explicit: false,
            confidence: 0.5,
          },
          status: "active",
          confidence: 0.5,
          explicit: false,
          value: { kind: "string", value: "confident" },
          createdAt: ts,
          updatedAt: ts,
        },
      ],
    });
    expect(story.artifactId).toMatch(/^cdfart_/);
    expect(story.validationStatus).toBe("review_required");
    const ver = getArtifactVersion(story.artifactId, story.artifactVersion);
    expect(ver.status).toBe("candidate"); // not auto-approved
  });

  it("D/E/G/Q — select_route creates design-system; idempotent; no bootstrap", () => {
    let cur = advanceToDesignRoutes(startAndBrief());
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: cur.sessionId,
      routeIndex: 0,
      routeTitle: "Bold Executive",
      routeDesc: "Navy #0B1F3A with green accent",
      expectedVersion: cur.sessionVersion,
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    cur = selected.value.session;
    const ds = cur.selectedArtifacts?.find(
      (a) => a.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
    );
    expect(ds).toBeDefined();
    expect(ds!.version).toBe(1);
    const data = getArtifactVersion(ds!.artifactId, ds!.version).data;
    expect(data.derivedFromRoute?.artifactId).toMatch(/^cdfart_/);
    expect(String(data.derivedFromRoute?.artifactId)).not.toContain("fixture");

    const again = ensureDesignSystemOnSelect({
      session: cur,
      phaseId: "design-routes",
      routeIndex: 0,
      routeTitle: "Bold Executive",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(again.idempotent).toBe(true);
    expect(again.designSystemRef.artifactId).toBe(ds!.artifactId);
  });

  it("F/H/I — full deck exact dependency versions via M3C+M4", () => {
    let cur = advanceToDesignRoutes(startAndBrief());
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: cur.sessionId,
      routeIndex: 1,
      routeTitle: "Warm Editorial",
      expectedVersion: cur.sessionVersion,
    });
    if (!selected.ok) throw new Error(selected.error.message);
    cur = selected.value.session;

    const story = ingestGenerationCompletion({
      sessionId: cur.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      expectedSessionVersion: cur.sessionVersion,
      executionId: "exec_st",
      requirements: [],
    });
    markApproved(story.artifactId, story.artifactVersion, {
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    const slides = ingestGenerationCompletion({
      sessionId: cur.sessionId,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      rawOutput: GOLDEN_LEGACY_SLIDE_CONTENT,
      expectedSessionVersion: cur.sessionVersion,
      executionId: "exec_sc",
      requirements: [],
    });
    markApproved(slides.artifactId, slides.artifactVersion, {
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });

    let s = getCdfSession(cur.sessionId)!;
    s = upsertSessionArtifactRef(s, {
      artifactId: story.artifactId,
      version: story.artifactVersion,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      phaseId: "storyline",
      role: "approved",
    });
    s = upsertSessionArtifactRef(s, {
      artifactId: slides.artifactId,
      version: slides.artifactVersion,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      phaseId: "slide-content",
      role: "approved",
    });
    saveCdfSession(s);
    cur = s;

    const ds = cur.selectedArtifacts!.find(
      (a) => a.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
    )!;
    const route = cur.selectedArtifacts!.find(
      (a) => a.artifactKey === PRESENTATION_ARTIFACT_KEYS.designRoute,
    )!;

    const result = tryIngestPresentationCdfCompletion({
      metadata: {
        cdfSessionId: cur.sessionId,
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
        cdfContextHash: "hash_e2e_1",
      },
      rawOutput: GOLDEN_LEGACY_ROUTES,
      executionId: "exec_deck_exact",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(result?.kind).toBe("accepted");
    if (result?.kind !== "accepted") return;
    expect(result.attach.cdfRuntimePath).toBe("canonical");
    expect(result.attach.cdfRuntimeVersion).toBe(CDF_PRESENTATION_RUNTIME_VERSION);

    const deck = getArtifactVersion(
      result.attach.cdfArtifactId,
      result.attach.cdfArtifactVersion,
    ).data;
    expect(deck.designSystemRef).toEqual({
      artifactId: ds.artifactId,
      version: ds.version,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    });
    const upstream =
      (
        deck.sourceRefs as {
          upstreamArtifactRefs?: Array<{
            artifactId: string;
            version: number;
            artifactKey: string;
          }>;
        }
      )?.upstreamArtifactRefs ?? [];
    expect(
      upstream.some(
        (u) =>
          u.artifactId === story.artifactId &&
          u.version === story.artifactVersion,
      ),
    ).toBe(true);
    expect(
      upstream.some(
        (u) =>
          u.artifactId === slides.artifactId &&
          u.version === slides.artifactVersion,
      ),
    ).toBe(true);
    expect(
      upstream.some(
        (u) => u.artifactId === ds.artifactId && u.version === ds.version,
      ),
    ).toBe(true);
    expect(
      upstream.some(
        (u) => u.artifactId === route.artifactId && u.version === route.version,
      ),
    ).toBe(true);
  });

  it("J/K/N/O — canonical M5B exact version; skip legacy by default; legacy-only untouched", async () => {
    expect(
      shouldSkipLegacyPresentationExport({
        metadata: {},
        canonicalAttached: false,
      }),
    ).toBe(false);

    let cur = advanceToDesignRoutes(startAndBrief());
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: cur.sessionId,
      routeIndex: 0,
      routeTitle: "Route A",
      expectedVersion: cur.sessionVersion,
    });
    if (!selected.ok) throw new Error(selected.error.message);
    cur = selected.value.session;

    const accepted = tryIngestPresentationCdfCompletion({
      metadata: {
        cdfSessionId: cur.sessionId,
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
      },
      rawOutput: GOLDEN_LEGACY_ROUTES,
      executionId: "exec_dl",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(accepted?.kind).toBe("accepted");
    if (accepted?.kind !== "accepted") return;

    expect(
      shouldSkipLegacyPresentationExport({
        metadata: {
          cdfSessionId: cur.sessionId,
          cdfPhaseId: "full-deck",
        },
        canonicalAttached: true,
      }),
    ).toBe(true);

    markApproved(
      accepted.attach.cdfArtifactId,
      accepted.attach.cdfArtifactVersion,
      { organizationId: "org_m7h", projectId: "proj_m7h" },
    );
    const rendered = await httpRenderArtifact({
      artifactId: accepted.attach.cdfArtifactId,
      artifactVersion: accepted.attach.cdfArtifactVersion,
      body: { format: "pptx", purpose: "final" },
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(rendered.artifactVersion).toBe(accepted.attach.cdfArtifactVersion);
    expect(getRenderedFile(rendered.fileId)?.artifactId).toBe(
      accepted.attach.cdfArtifactId,
    );
  });

  it("T/P — e2e brief→select→deck→M6 refine→PPTX+PDF", async () => {
    let cur = advanceToDesignRoutes(startAndBrief());
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: cur.sessionId,
      routeIndex: 0,
      routeTitle: "Bold Executive",
      expectedVersion: cur.sessionVersion,
    });
    if (!selected.ok) throw new Error(selected.error.message);
    cur = selected.value.session;

    const story = ingestGenerationCompletion({
      sessionId: cur.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      rawOutput: GOLDEN_LEGACY_STORYLINE,
      expectedSessionVersion: cur.sessionVersion,
      executionId: "e2e_st",
      requirements: [],
    });
    const slides = ingestGenerationCompletion({
      sessionId: cur.sessionId,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      rawOutput: GOLDEN_LEGACY_SLIDE_CONTENT,
      expectedSessionVersion: cur.sessionVersion,
      executionId: "e2e_sc",
      requirements: [],
    });

    const deckRes = tryIngestPresentationCdfCompletion({
      metadata: {
        cdfSessionId: cur.sessionId,
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
        cdfContextHash: "e2e_hash",
      },
      rawOutput: GOLDEN_LEGACY_ROUTES,
      executionId: "e2e_deck",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(deckRes?.kind).toBe("accepted");
    if (deckRes?.kind !== "accepted") return;

    markApproved(
      deckRes.attach.cdfArtifactId,
      deckRes.attach.cdfArtifactVersion,
      { organizationId: "org_m7h", projectId: "proj_m7h" },
    );

    const refined = applyTargetedRefinement({
      sessionId: cur.sessionId,
      serviceId: "presentation",
      phaseId: "slide-refinement",
      organizationId: "org_m7h",
      projectId: "proj_m7h",
      artifactId: deckRes.attach.cdfArtifactId,
      artifactVersion: deckRes.attach.cdfArtifactVersion,
      rawInstruction: "Make the title on slide 1 larger",
      expectedSessionVersion: cur.sessionVersion,
      m4Requirements: [],
    });
    expect(["applied", "requires_clarification", "validation_failed"]).toContain(
      refined.status,
    );

    const versionForRender =
      refined.status === "applied" && refined.artifactVersion != null
        ? refined.artifactVersion
        : deckRes.attach.cdfArtifactVersion;

    if (refined.status === "applied" && refined.artifactVersion != null) {
      markApproved(deckRes.attach.cdfArtifactId, refined.artifactVersion, {
        organizationId: "org_m7h",
        projectId: "proj_m7h",
      });
    }

    const pptx = await httpRenderArtifact({
      artifactId: deckRes.attach.cdfArtifactId,
      artifactVersion: versionForRender,
      body: { format: "pptx", purpose: "final" },
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    const pdf = await httpRenderArtifact({
      artifactId: deckRes.attach.cdfArtifactId,
      artifactVersion: versionForRender,
      body: { format: "pdf", purpose: "final" },
      organizationId: "org_m7h",
      projectId: "proj_m7h",
    });
    expect(pptx.artifactVersion).toBe(versionForRender);
    expect(pdf.artifactVersion).toBe(versionForRender);
    expect(listArtifactVersions(story.artifactId).length).toBeGreaterThanOrEqual(1);
    expect(listArtifactVersions(slides.artifactId).length).toBeGreaterThanOrEqual(1);
  });
});
