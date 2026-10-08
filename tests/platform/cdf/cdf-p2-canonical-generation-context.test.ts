/**
 * Phase 2 — Canonical Generation Context Bridge tests.
 * Proves exact ArtifactVersion rehydration through provider-visible request.
 */

import { pinGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";
import {
  applyCdfTransition,
  bindCanonicalGenerationRequestToPrompt,
  compileCanonicalGenerationRequest,
  computeGenerationContextHash,
  createArtifact,
  createVersion,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  isCdfCanonicalGenerationContextEnabled,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveGenerationContext,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
} from "../../../src/platform/ai/canonical-model-request";
import {
  isPresentationDirectCreate,
  stampPresentationCreateMetadata,
} from "../../../src/platform/direct/presentation-direct-metadata";
import { shouldSkipEffectiveInstructionPromptReplace } from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-handoff";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";

const ORG = "org_p2_ctx";
const PROJ = "proj_p2_ctx";

/** Phase 4: apply returns placeholder prompt; flatten only via provider-compat API. */
function providerFlatFromApply(
  result: Extract<
    ReturnType<typeof tryApplyCanonicalGenerationContext>,
    { ok: true; skipped: false }
  >,
): string {
  expect(result.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);
  expect(result.modelRequest).toBeDefined();
  return flattenCanonicalModelRequestToLabeledPrompt(result.modelRequest);
}

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

/** Oversized structured marker that cannot survive 1500-char note truncation alone. */
function largeStorylineData(marker: string) {
  const base = fixturePresentationStoryline();
  const pad = "PAD_".repeat(500); // >> 1500 chars
  return {
    ...base,
    objective: `${marker} ${pad} OBJECTIVE_END`,
    narrativeStrategy: `${marker}_NARRATIVE ${pad}`,
    notes: `${marker}_NOTES ${pad}`,
    slides: [
      ...base.slides,
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `slide_extra_${i}`,
        order: 10 + i,
        title: `${marker}_SLIDE_${i}`,
        purpose: `Purpose ${i} ${pad.slice(0, 80)}`,
        keyMessage: `Key ${marker} ${i}`,
      })),
    ],
  };
}

describe("Phase 2 Canonical Generation Context Bridge", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("flag helpers — ON/OFF", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    expect(isCdfCanonicalGenerationContextEnabled()).toBe(true);
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "true";
    expect(isCdfCanonicalGenerationContextEnabled()).toBe(true);
    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    expect(isCdfCanonicalGenerationContextEnabled()).toBe(false);
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    expect(isCdfCanonicalGenerationContextEnabled()).toBe(false);
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  it("TEST 8 — flag OFF skips canonical path (legacy unchanged)", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacyPrompt =
      "Approved upstream stages:\n- phase storyline · OLD_TRUNCATED_NOTE";
    const result = tryApplyCanonicalGenerationContext({
      prompt: legacyPrompt,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.prompt).toBe(legacyPrompt);
    expect(result.metadata.cdfCanonicalContextApplied).toBe(false);
  });

  it("TEST 1+5+9 — storyline→slide-content rehydrates exact data; note not SoT", () => {
    let session = selectSource(startBrief());
    const MARKER = "STRUCTURED_CANONICAL_CONTENT_XYZ";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(MARKER) as unknown as Record<string, unknown>,
      requestId: "req_story_v1",
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    // Approve storyline phase in session gates (note is wrong/truncated SoT).
    const approved = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "OLD_TRUNCATED_NOTE",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: created.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!approved.ok) throw new Error(approved.error.message);
    session = approved.value.session;
    // Re-attach exact ref after transition (approve may dual-write).
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const result = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content for this stage only.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) {
      throw new Error(`expected applied, got ${JSON.stringify(result)}`);
    }
    expect(result.metadata.cdfCanonicalContextApplied).toBe(true);
    expect(result.request.upstreamArtifacts.length).toBeGreaterThanOrEqual(1);
    const upstream = result.request.upstreamArtifacts.find(
      (u) => u.artifactKey === PRESENTATION_ARTIFACT_KEYS.storyline,
    );
    expect(upstream).toBeDefined();
    expect(upstream!.artifactId).toBe(created.artifact.artifactId);
    expect(upstream!.version).toBe(1);
    expect(upstream!.role).toBe("approved_content");
    expect(JSON.stringify(upstream!.data)).toContain(MARKER);
    expect(JSON.stringify(upstream!.data).length).toBeGreaterThan(1500);

    // Bound prompt contains structured content, not note-only authority.
    const flat = providerFlatFromApply(result);
    expect(flat).toContain("UPSTREAM ARTIFACTS");
    expect(flat).toContain(MARKER);
    expect(flat).toContain(`Version: 1`);
    expect(flat).toContain("Role: approved_content");
    expect(flat).toContain(
      "Canonical ArtifactVersion data above is authoritative",
    );
    // Approval note must not be the sole channel — structured marker present.
    expect(flat.includes(MARKER)).toBe(true);

    // Provider boundary: OpenAI mapper sees the structured content in user message.
    const prompt = flat;
    const execReq = {
      ...sampleRequest({
        requestId: "p2_wire",
        providerId: "provider.openai",
        payload: { prompt, text: prompt, input: prompt },
      }),
      capabilityId: "text.generate",
      modelId: "gpt-4o",
      metadata: result.metadata,
    };
    const adapterReq = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapterReq, "gpt-4o");
    const messages = (wire.body as { messages: Array<{ content: string }> })
      .messages;
    const userContent = messages.map((m) => m.content).join("\n");
    expect(userContent).toContain(MARKER);
    expect(userContent.length).toBeGreaterThan(1500);
  });

  it("TEST 2 — exact version pin (v3 not v4/latest)", () => {
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
      requestId: "req_story_exact_1",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (const marker of ["VERSION_TWO", "VERSION_THREE"]) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationStoryline(),
          objective: marker,
        } as unknown as Record<string, unknown>,
        requestId: `req_story_${marker}`,
      });
      latest = next.version.version;
    }
    expect(latest).toBe(3);
    markApproved(artifactId, 3, { organizationId: ORG, projectId: PROJ });

    // Approve CDF phase while v3 is still approved (before creating newer HEAD).
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "storyline ok",
      artifactId,
      artifactVersion: 3,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: artifactId, version: 3 }), getCdfSession(session.sessionId)!.sessionVersion),
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

    // Newer HEAD exists — must not be substituted for the pinned dependency.
    const v4 = createVersion({
      artifactId,
      expectedLatestVersion: 3,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: "VERSION_FOUR",
      } as unknown as Record<string, unknown>,
      requestId: "req_story_VERSION_FOUR",
    });
    expect(v4.version.version).toBe(4);
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 3,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const result = tryApplyCanonicalGenerationContext({
      prompt: "Build slide content",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    const up = result.request.upstreamArtifacts.find(
      (u) => u.artifactId === artifactId,
    );
    expect(up?.version).toBe(3);
    expect(JSON.stringify(up?.data)).toContain("VERSION_THREE");
    expect(JSON.stringify(up?.data)).not.toContain("VERSION_FOUR");
    const flat = providerFlatFromApply(result);
    expect(flat).toContain("VERSION_THREE");
    expect(flat).not.toContain("VERSION_FOUR");
  });

  it("TEST 3 — requirements / ActiveBrief reach canonical context", () => {
    let session = selectSource(startBrief());
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "req_story_req",
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "ok",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: created.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(ap.value.session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const result = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.request.cdfContext.activeBriefId).toBeTruthy();
    expect(result.request.requirements.length).toBeGreaterThan(0);
    // Priority ladder: explicit_current ranks first when present.
    const priorities = result.request.requirements.map((r) => String(r.priority));
    expect(priorities.length).toBeGreaterThan(0);
    const flat = providerFlatFromApply(result);
    expect(flat).toContain("REQUIREMENTS");
    expect(flat).toContain("CURRENT USER INSTRUCTION");
    expect(result.request.currentUserInstruction).toContain("Generate slide content");
  });

  it("TEST 4 — missing required artifact fails closed (no note fallback)", () => {
    let session = selectSource(startBrief());
    // Approve storyline with note only — no canonical artifact on session.
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "FAKE_NOTE_ONLY_NO_ARTIFACT",
      expectedVersion: session.sessionVersion,
    });
    expect(ap.ok).toBe(false);
    if (ap.ok) return;
    expect(ap.error.message).toMatch(/no canonical ArtifactVersion/);
    session = getCdfSession(session.sessionId)!;
    expect(session.approvedArtifacts ?? []).toHaveLength(0);

    const result = tryApplyCanonicalGenerationContext({
      prompt:
        "Approved upstream stages:\n- phase storyline · FAKE_NOTE_ONLY_NO_ARTIFACT",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([
      "DEPENDENCY_NOT_SATISFIED",
      "CONTEXT_RESOLUTION_FAILED",
    ]).toContain(result.code);
    expect(result.message).not.toMatch(/FAKE_NOTE_ONLY/);
    // Must not return a prompt that uses the note as canonical content.
    expect("prompt" in result ? (result as { prompt?: string }).prompt : undefined).toBeUndefined();
  });

  it("TEST 6 — full-deck consumes slide-content + design-system; skips concepts path", () => {
    let session = selectSource(startBrief());

    const story = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "fd_story",
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
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: story.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
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
            title: "CANONICAL_SLIDE_CONTENT_MARKER",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "Must appear in full-deck context",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "fd_slides",
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
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: slides.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = upsertSessionArtifactRef(cur.value.session, {
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
      requestId: "fd_route",
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
        name: "DESIGN_SYSTEM_CANONICAL_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "fd_ds",
    });
    markSelected(ds.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });

    session = upsertSessionArtifactRef(session, {
      artifactId: route.artifact.artifactId,
      version: 1,
      phaseId: "design-routes",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      role: "selected",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: ds.artifact.artifactId,
      version: 1,
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      role: "selected",
    });
    // Advance to full-deck via design-routes select (also creates DS in real path).
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
    // Ensure our exact pins remain (select may add more).
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

    const result = tryApplyCanonicalGenerationContext({
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
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) {
      throw new Error(`expected full-deck applied: ${JSON.stringify(result)}`);
    }
    expect(result.request.outputContract.canonicalFullDeck).toBe(true);
    expect(result.metadata.cdfCanonicalFullDeck).toBe(true);
    expect(result.metadata.cdfOmitConceptsExpansion).toBe(true);
    const flat = providerFlatFromApply(result);
    expect(flat).toContain("CANONICAL_SLIDE_CONTENT_MARKER");
    expect(flat).toContain("DESIGN_SYSTEM_CANONICAL_MARKER");
    expect(flat).toContain("design_reference");

    const stamped = stampPresentationCreateMetadata(result.metadata);
    expect(
      (stamped.structuredOutput as { name?: string })?.name,
    ).toBe("PresentationRoutes");
    expect(isPresentationDirectCreate(stamped)).toBe(false);
  });

  it("TEST 7 — CTI instruction does not wipe CDF context", () => {
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
        objective: "CTI_UPSTREAM_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "cti_story",
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: created.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(ap.value.session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const result = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content for this stage only.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: "Make slide 4 more premium.",
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationalInstruction: "Make slide 4 more premium.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.request.currentUserInstruction).toContain("premium");
    const flat = providerFlatFromApply(result);
    expect(flat).toContain("CURRENT USER INSTRUCTION");
    expect(flat).toContain("Make slide 4 more premium");
    expect(flat).toContain("CTI_UPSTREAM_MARKER");
    expect(flat).toContain("CDF PHASE");
    expect(flat).toContain("UPSTREAM ARTIFACTS");
    expect(result.metadata.cdfSkipEffectiveInstructionReplace).toBe(true);
    expect(
      shouldSkipEffectiveInstructionPromptReplace(result.metadata),
    ).toBe(true);
  });

  it("TEST 10 — deterministic context hash", () => {
    let session = selectSource(startBrief());
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "hash_story",
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: created.artifact.artifactId, version: 1 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(ap.value.session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const a = tryApplyCanonicalGenerationContext({
      prompt: "Same instruction",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    const b = tryApplyCanonicalGenerationContext({
      prompt: "Same instruction",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(a.ok && !a.skipped && b.ok && !b.skipped).toBe(true);
    if (!a.ok || a.skipped || !b.ok || b.skipped) return;
    expect(a.request.generationContextHash).toBe(b.request.generationContextHash);

    const c = tryApplyCanonicalGenerationContext({
      prompt: "Different instruction",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(c.ok && !c.skipped).toBe(true);
    if (!c.ok || c.skipped) return;
    expect(c.request.generationContextHash).not.toBe(
      a.request.generationContextHash,
    );

    // Version change changes hash.
    const v2 = createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: "CHANGED",
      } as unknown as Record<string, unknown>,
      requestId: "hash_story_v2",
    });
    markApproved(created.artifact.artifactId, v2.version.version, {
      organizationId: ORG,
      projectId: PROJ,
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: v2.version.version,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    const d = tryApplyCanonicalGenerationContext({
      prompt: "Same instruction",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(d.ok && !d.skipped).toBe(true);
    if (!d.ok || d.skipped) return;
    expect(d.request.generationContextHash).not.toBe(
      a.request.generationContextHash,
    );
  });

  it("compile + bind expose labeled sections without 1500 truncation", () => {
    const resolved = resolveGenerationContext({
      sessionId: selectSource(startBrief()).sessionId,
      phaseId: "storyline",
      currentUserInstruction: "instr",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const huge = "X".repeat(4000);
    const req = compileCanonicalGenerationRequest({
      resolved: resolved.context,
      currentUserInstruction: "instr",
      canonicalFullDeck: false,
      upstream: [
        {
          artifactId: "cdfart_test",
          version: 2,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
          phaseId: "storyline",
          role: "approved_content",
          status: "approved",
          schemaVersion: "1",
          data: { marker: huge, slides: [{ title: "T" }] },
          lineage: { sourceArtifacts: [] },
          sessionRole: "approved",
          required: true,
        },
      ],
    });
    const prompt = bindCanonicalGenerationRequestToPrompt(req);
    expect(prompt).toContain(huge);
    expect(prompt.length).toBeGreaterThan(1500);
    expect(computeGenerationContextHash({
      currentUserInstruction: "instr",
      resolved: resolved.context,
      upstream: req.upstreamArtifacts,
      canonicalFullDeck: false,
    })).toBe(req.generationContextHash);
  });
});
