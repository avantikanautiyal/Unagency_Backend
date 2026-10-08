/**
 * Phase 6 — Deterministic generation reference resolution.
 */

import { pinGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";
import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  createVersion,
  detectCanonicalSectionsFromModelRequest,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  getLatestCanonicalTraceEvent,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveGenerationReferences,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  flattenCanonicalModelRequestToLabeledPrompt,
  mapCanonicalModelRequestToProviderPayload,
} from "../../../src/platform/ai/canonical-model-request";
import { resolveGenerationReferences as resolveRefsDirect } from "../../../src/platform/ai/reference-resolution";

const ORG = "org_p6_ref";
const PROJ = "proj_p6_ref";

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
    brief: "Create a 12-slide investor presentation. Audience: Series A.",
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

function fourSlides() {
  const base = fixturePresentationSlideContent();
  return {
    ...base,
    slides: [
      ...base.slides,
      {
        id: "slide_04",
        order: 3,
        title: "Slide Four",
        blocks: [
          {
            id: "block_04",
            type: "paragraph",
            content: "SLIDE_4_MARKER",
            hierarchy: 1,
          },
        ],
      },
    ],
  };
}

const presentationMeta = (sessionId: string, phaseId: string) => ({
  cdfSessionId: sessionId,
  cdfPhaseId: phaseId,
  cdfServiceId: "presentation",
  service: "Presentations",
  outputKind: phaseId === "full-deck" ? "presentation" : undefined,
});

function approveArtifact(input: {
  session: ReturnType<typeof startBrief>;
  phaseId: string;
  artifactKey: string;
  data: Record<string, unknown>;
  requestId: string;
  version?: number;
}) {
  let session = input.session;
  const created = createArtifact({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: input.phaseId,
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: input.artifactKey,
    artifactType: "structured_doc",
    data: input.data,
    requestId: input.requestId,
  });
  let version = created.version.version;
  const artifactId = created.artifact.artifactId;
  if (input.version && input.version > 1) {
    let latest = version;
    for (let v = 2; v <= input.version; v++) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: { ...input.data, _v: v },
        requestId: `${input.requestId}_v${v}`,
      });
      latest = next.version.version;
      version = latest;
    }
  }
  const targetVersion = input.version ?? version;
  markApproved(artifactId, targetVersion, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const approved = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "note",
    artifactId,
    artifactVersion: targetVersion,
    expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: artifactId, version: targetVersion }), getCdfSession(session.sessionId)!.sessionVersion),
  });
  if (!approved.ok) throw new Error(approved.error.message);
  session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
    artifactId,
    version: targetVersion,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId,
    version: targetVersion,
  };
}

describe("Phase 6 Reference Resolution", () => {
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

  it("previous output resolves to exact slide-content version", () => {
    let session = selectSource(startBrief());
    const story = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "p6_prev_story",
    });
    session = story.session;
    const slides = approveArtifact({
      session,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      data: fourSlides() as unknown as Record<string, unknown>,
      requestId: "p6_prev_slides",
      version: 5,
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate design routes",
      conversationalInstruction: "Use the previous output.",
      metadata: presentationMeta(slides.session.sessionId, "design-routes"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe("Use the previous output.");
    const refs = applied.request.referenceResolution?.references ?? [];
    const hit = refs.find((r) => r.referenceType === "previous_output");
    expect(hit?.status).toMatch(/exact|deterministic/);
    expect(hit?.artifactId).toBe(slides.artifactId);
    expect(hit?.version).toBe(5);
  });

  it("explicit version 3 resolves; not version 4", () => {
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
        objective: "V1",
      } as unknown as Record<string, unknown>,
      requestId: "p6_ver_1",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (const marker of ["V2", "V3", "V4"]) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationStoryline(),
          objective: marker,
        } as unknown as Record<string, unknown>,
        requestId: `p6_${marker}`,
      });
      latest = next.version.version;
    }
    markApproved(artifactId, 4, { organizationId: ORG, projectId: PROJ });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId,
      artifactVersion: 4,
      expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: artifactId, version: 4 }), getCdfSession(session.sessionId)!.sessionVersion),
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 4,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use version 3.",
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const verRef = applied.request.referenceResolution?.references.find(
      (r) => r.referenceType === "artifact_version",
    );
    expect(verRef?.version).toBe(3);
    expect(verRef?.artifactId).toBe(artifactId);
    expect(verRef?.status).toBe("exact");
  });

  it("slide 4 and first slide resolve from structured deck", () => {
    const session = selectSource(startBrief());
    const slides = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: {
        ...fixturePresentationStoryline(),
        slides: fourSlides().slides.map((s, i) => ({
          id: s.id,
          order: i,
          title: s.title,
          purpose: "p",
          keyMessage: "k",
        })),
      } as unknown as Record<string, unknown>,
      requestId: "p6_slide_story",
    });
    // Prefer slide-content structured data for slide targets
    const content = approveArtifact({
      session: slides.session,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      data: fourSlides() as unknown as Record<string, unknown>,
      requestId: "p6_slide_content",
    });

    const a = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Change slide 4.",
      metadata: presentationMeta(content.session.sessionId, "design-routes"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(a.ok).toBe(true);
    if (!a.ok || a.skipped) throw new Error("expected applied");
    const slideRef = a.request.referenceResolution?.references.find(
      (r) => r.referenceType === "slide",
    );
    expect(slideRef?.slideNumber).toBe(4);
    expect(slideRef?.status).toBe("exact");

    const b = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Make the first slide more premium.",
      metadata: presentationMeta(content.session.sessionId, "design-routes"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(b.ok).toBe(true);
    if (!b.ok || b.skipped) throw new Error("expected applied");
    const first = b.request.referenceResolution?.references.find(
      (r) => r.referenceType === "slide",
    );
    expect(first?.slideNumber).toBe(1);
  });

  it("explicit slide 4 overrides selected slide 3", () => {
    const result = resolveRefsDirect({
      instruction: "Update slide 4.",
      candidates: [
        {
          artifactId: "cdfart_x",
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
          sessionRole: "approved",
          slideCount: 4,
          slideIds: ["s1", "s2", "s3", "s4"],
        },
      ],
      selectedSlideNumber: 3,
    });
    expect(result.originalUserInstruction).toBe("Update slide 4.");
    expect(result.references[0]?.slideNumber).toBe(4);
    expect(result.references[0]?.slideNumber).not.toBe(3);
  });

  it("same design resolves when one design-system exists", () => {
    const result = resolveRefsDirect({
      instruction: "Use the same design.",
      candidates: [
        {
          artifactId: "cdfart_ds",
          version: 2,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          sessionRole: "selected",
        },
      ],
    });
    const hit = result.references.find((r) => r.referenceType === "design_system");
    expect(hit?.artifactId).toBe("cdfart_ds");
    expect(hit?.version).toBe(2);
    expect(hit?.status).toMatch(/exact|deterministic/);
  });

  it("ambiguous approved design does not pick arbitrarily", () => {
    const result = resolveRefsDirect({
      instruction: "Use the approved design.",
      candidates: [
        {
          artifactId: "cdfart_ds_a",
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          sessionRole: "approved",
        },
        {
          artifactId: "cdfart_ds_b",
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          sessionRole: "approved",
        },
      ],
    });
    const hit = result.references.find((r) =>
      r.sourceText.toLowerCase().includes("approved design"),
    );
    expect(hit?.status).toBe("ambiguous");
    expect(hit?.artifactId).toBeUndefined();
    expect(hit?.candidateSummaries?.length).toBe(2);
  });

  it("unresolved deictic preserves instruction and invents nothing", () => {
    const result = resolveRefsDirect({
      instruction: "Make that better.",
      candidates: [
        {
          artifactId: "cdfart_a",
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
          sessionRole: "approved",
        },
        {
          artifactId: "cdfart_b",
          version: 5,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
          sessionRole: "approved",
        },
      ],
    });
    expect(result.originalUserInstruction).toBe("Make that better.");
    const deictic = result.references.find((r) => r.referenceType === "deictic");
    expect(deictic?.status).toBe("unresolved");
    expect(deictic?.artifactId).toBeUndefined();
  });

  it("original instruction preserved separately from resolved references in CMR", () => {
    const instruction = "Make that more premium.";
    const session = selectSource(startBrief());
    const pinned = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "p6_orig",
    });
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(instruction);
    const text = applied.modelRequest.messages
      .flatMap((m) => m.content)
      .find(
        (p) => p.type === "text" && p.semanticRole === "current_user_instruction",
      );
    expect(text && text.type === "text" ? text.text : null).toBe(instruction);
    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    // Single candidate → deictic may resolve; still separate part when applied
    if (applied.request.referenceResolution?.applied) {
      expect(sections.resolvedReferences).toBe(true);
    }
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain(`===== CURRENT USER INSTRUCTION =====\n${instruction}`);
  });

  it("CMR keeps instruction, references, upstream separate; provider receives all", () => {
    const session = selectSource(startBrief());
    const pinned = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: {
        ...fixturePresentationStoryline(),
        objective: "P6_UPSTREAM_ONLY",
      } as unknown as Record<string, unknown>,
      requestId: "p6_cmr",
    });
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Change slide 1.",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.resolvedReferences).toBe(true);
    expect(sections.upstreamArtifacts).toBe(true);

    const mapped = mapCanonicalModelRequestToProviderPayload(applied.modelRequest, {
      providerId: "openai",
    });
    expect(mapped.prompt).toContain("Change slide 1.");
    expect(mapped.prompt).toContain("RESOLVED REFERENCES");
    expect(mapped.prompt).toContain("P6_UPSTREAM_ONLY");
    expect(mapped.prompt).toContain(`${pinned.artifactId}@${pinned.version}`);
  });

  it("flag OFF leaves legacy path unchanged (no reference metadata)", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "legacy prompt body",
      conversationalInstruction: "Use the previous output.",
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error("ok");
    expect(applied.skipped).toBe(true);
    if (applied.skipped) {
      expect(applied.prompt).toBe("legacy prompt body");
      expect(applied.metadata.cdfReferenceResolutionApplied).toBeUndefined();
    }
  });

  it("full-deck resolves approved slide content + selected design", () => {
    let session = selectSource(startBrief());
    const story = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "p6_fd_story",
    });
    session = story.session;
    const slides = approveArtifact({
      session,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      data: fourSlides() as unknown as Record<string, unknown>,
      requestId: "p6_fd_slides",
    });
    session = slides.session;
    const route = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "design-routes",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      artifactType: "config_choice",
      data: fixturePresentationDesignRoute() as unknown as Record<string, unknown>,
      requestId: "p6_fd_route",
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
      data: fixturePresentationDesignSystem() as unknown as Record<string, unknown>,
      requestId: "p6_fd_ds",
    });
    markSelected(ds.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    const cur = applyCdfTransition({
      action: "select_route",
      sessionId: session.sessionId,
      routeIndex: 1,
      routeTitle: "Bold Executive",
      routeDesc: "Navy",
      artifactId: route.artifact.artifactId,
      artifactVersion: 1,
      expectedVersion: session.sessionVersion,
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = getCdfSession(session.sessionId)!;
    for (const ref of [
      {
        artifactId: slides.artifactId,
        version: slides.version,
        phaseId: "slide-content",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
        role: "approved" as const,
      },
      {
        artifactId: ds.artifact.artifactId,
        version: 1,
        phaseId: "select",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
        role: "selected" as const,
      },
      {
        artifactId: story.artifactId,
        version: story.version,
        phaseId: "storyline",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
        role: "approved" as const,
      },
      {
        artifactId: route.artifact.artifactId,
        version: 1,
        phaseId: "design-routes",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
        role: "selected" as const,
      },
    ]) {
      session = upsertSessionArtifactRef(session, ref);
    }
    saveCdfSession(session);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate full deck",
      conversationalInstruction:
        "Use the approved slide content and keep the selected design.",
      metadata: presentationMeta(session.sessionId, "full-deck"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.metadata.cdfCanonicalFullDeck).toBe(true);
    expect(applied.metadata.cdfOmitConceptsExpansion).toBe(true);
    const refs = applied.request.referenceResolution?.references ?? [];
    const sc = refs.find(
      (r) =>
        r.artifactKey === PRESENTATION_ARTIFACT_KEYS.slideContent ||
        (r.referenceType === "approved_output" &&
          r.artifactId === slides.artifactId),
    );
    const design = refs.find(
      (r) =>
        r.artifactId === ds.artifact.artifactId ||
        r.referenceType === "design_system",
    );
    expect(sc?.artifactId).toBe(slides.artifactId);
    expect(sc?.version).toBe(slides.version);
    expect(design?.artifactId).toBe(ds.artifact.artifactId);
    expect(design?.version).toBe(1);
  });

  it("trace includes reference resolution fields with correlation", async () => {
    const session = selectSource(startBrief());
    const pinned = approveArtifact({
      session,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "p6_trace",
    });
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate",
      conversationalInstruction: "Change slide 1.",
      metadata: {
        ...presentationMeta(pinned.session.sessionId, "slide-content"),
        apiExecutionId: "exec_p6_trace",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p6_trace",
    });
    expect(proof.providerInvoked).toBe(true);
    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");
    const compiled = getLatestCanonicalTraceEvent(
      "cdf.generation_context.compiled",
    );
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    expect(
      compiled && "referenceResolutionApplied" in compiled
        ? compiled.referenceResolutionApplied
        : false,
    ).toBe(true);
    expect(
      compiled && "resolvedReferenceCount" in compiled
        ? compiled.resolvedReferenceCount
        : 0,
    ).toBeGreaterThanOrEqual(1);
    expect(compiled?.generationContextHash).toBeTruthy();
    expect(compiled?.executionId).toBe("exec_p6_trace");
    expect(boundary?.cdfSessionId).toBe(compiled?.cdfSessionId);
    expect(boundary?.generationContextHash).toBe(compiled?.generationContextHash);
    expect(
      boundary && "referenceResolutionApplied" in boundary
        ? boundary.referenceResolutionApplied
        : false,
    ).toBe(true);
  });

  it("pure resolver: no latest substitution for version", () => {
    // ensure export path works for unit callers
    expect(typeof resolveGenerationReferences).toBe("function");
    const r = resolveRefsDirect({
      instruction: "Use version 3.",
      candidates: [
        {
          artifactId: "cdfart_a",
          version: 3,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
        },
        {
          artifactId: "cdfart_a",
          version: 4,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
        },
      ],
    });
    expect(r.references[0]?.version).toBe(3);
    expect(r.references[0]?.version).not.toBe(4);
  });
});
