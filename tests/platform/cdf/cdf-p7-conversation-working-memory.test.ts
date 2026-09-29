/**
 * Phase 7 — Conversation Working Memory (bounded, deterministic).
 */

import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  createVersion,
  DEFAULT_WORKING_MEMORY_BOUNDS,
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
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  selectConversationWorkingMemory,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  flattenCanonicalModelRequestToLabeledPrompt,
  mapCanonicalModelRequestToProviderPayload,
} from "../../../src/platform/ai/canonical-model-request";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";

const ORG = "org_p7_wm";
const PROJ = "proj_p7_wm";
const CONV = "conv_p7_main";
const OTHER_CONV = "conv_p7_other";

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

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p7",
    ...partial,
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
    note: "OLD_APPROVAL_NOTE_ONLY",
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

const presentationMeta = (sessionId: string, phaseId: string) => ({
  cdfSessionId: sessionId,
  cdfPhaseId: phaseId,
  cdfServiceId: "presentation",
  service: "Presentations",
  conversationId: CONV,
  channelId: "ch_p7",
  outputKind: phaseId === "full-deck" ? "presentation" : undefined,
});

describe("Phase 7 Conversation Working Memory", () => {
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

  it("selects recent relevant user turn; excludes unrelated conversation", () => {
    const current = "Also make the CTA stronger.";
    const memory = selectConversationWorkingMemory({
      currentUserInstruction: current,
      conversationId: CONV,
      messages: [
        msg({
          id: "m1",
          role: "user",
          text: "Make the hero section more premium.",
          createdAt: "2026-01-01T10:00:00.000Z",
        }),
        msg({
          id: "m2",
          role: "assistant",
          text: "Do you want to keep the current layout?",
          createdAt: "2026-01-01T10:01:00.000Z",
        }),
        msg({
          id: "m3",
          role: "user",
          text: "Yes, but make it feel more minimal.",
          createdAt: "2026-01-01T10:02:00.000Z",
        }),
        msg({
          id: "m_other",
          conversationId: OTHER_CONV,
          role: "user",
          text: "Unrelated packaging brief about boxes.",
          createdAt: "2026-01-01T10:03:00.000Z",
        }),
        msg({
          id: "m4",
          role: "user",
          text: current,
          createdAt: "2026-01-01T10:04:00.000Z",
        }),
      ],
    });
    expect(memory.applied).toBe(true);
    expect(memory.selectionMethod).toBe("deterministic_recency_relevance");
    const texts = memory.items.map((i) => i.text);
    expect(texts.some((t) => t.includes("more minimal"))).toBe(true);
    expect(texts.some((t) => t.includes("Unrelated packaging"))).toBe(false);
    expect(texts).not.toContain(current);
  });

  it("enforces max turn and character bounds; never truncates current instruction", () => {
    const current = "CURRENT_INSTRUCTION_MUST_STAY_INTACT_XYZ";
    const messages: WorkingMemorySourceMessage[] = [];
    for (let i = 0; i < 15; i++) {
      messages.push(
        msg({
          id: `u${i}`,
          role: "user",
          text: `Historical preference turn ${i} `.repeat(20),
          createdAt: new Date(Date.UTC(2026, 0, 1, 10, i)).toISOString(),
        }),
      );
    }
    messages.push(
      msg({
        id: "cur",
        role: "user",
        text: current,
        createdAt: "2026-01-01T11:00:00.000Z",
      }),
    );

    const memory = selectConversationWorkingMemory({
      currentUserInstruction: current,
      conversationId: CONV,
      messages,
      bounds: { maxTurns: 3, maxCharacters: 800, candidateWindow: 20 },
    });
    expect(memory.turnCount).toBeLessThanOrEqual(3);
    expect(memory.characterCount).toBeLessThanOrEqual(800);
    expect(memory.truncated).toBe(true);
    expect(memory.droppedItemCount).toBeGreaterThan(0);
    expect(memory.items.every((i) => i.text !== current)).toBe(true);
    expect(current).toContain("CURRENT_INSTRUCTION_MUST_STAY_INTACT_XYZ");
  });

  it("CMR keeps instruction, working memory, requirements, upstream separate", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "P7_UPSTREAM_ARTIFACT_PAYLOAD",
      } as unknown as Record<string, unknown>,
      "p7_sep",
    );
    const instruction = "Make this more premium.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      conversationalInstruction: instruction,
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm1",
          role: "user",
          text: "Earlier, keep a minimal visual style.",
          createdAt: "2026-01-01T09:00:00.000Z",
        }),
        msg({
          id: "wm2",
          role: "assistant",
          text: "Understood — minimal and clean.",
          createdAt: "2026-01-01T09:01:00.000Z",
        }),
        msg({
          id: "wm3",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T09:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(instruction);
    expect(applied.request.workingMemory?.applied).toBe(true);
    expect(applied.request.requirements.length).toBeGreaterThan(0);
    expect(applied.request.upstreamArtifacts[0]?.data).toMatchObject({
      objective: "P7_UPSTREAM_ARTIFACT_PAYLOAD",
    });

    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.workingMemory).toBe(true);
    expect(sections.requirements).toBe(true);
    expect(sections.upstreamArtifacts).toBe(true);
    expect(sections.authority).toBe(true);

    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain(`===== CURRENT USER INSTRUCTION =====\n${instruction}`);
    expect(flat).toContain("===== WORKING MEMORY =====");
    expect(flat).toContain("Contextual conversational evidence only");
    expect(flat).toContain("minimal visual style");
    expect(flat).toContain("P7_UPSTREAM_ARTIFACT_PAYLOAD");
    // Working memory must not rewrite instruction
    const instrBlock = flat.slice(
      flat.indexOf("===== CURRENT USER INSTRUCTION ====="),
      flat.indexOf("===== WORKING MEMORY =====") >= 0
        ? flat.indexOf("===== WORKING MEMORY =====")
        : undefined,
    );
    expect(instrBlock).toContain(instruction);
  });

  it("working memory does not replace upstream ArtifactVersion or Phase 6 refs", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "EXACT_A5_PAYLOAD_MARKER",
        slides: [
          ...fixturePresentationStoryline().slides,
          {
            id: "slide_04",
            order: 3,
            title: "Four",
            purpose: "p",
            keyMessage: "k",
          },
        ],
      } as unknown as Record<string, unknown>,
      "p7_refs",
    );
    // Bump to version 5 representation via createVersion loop for exact pin @1 still used —
    // use version from approve (1) but distinctive payload.
    const instruction = "Make that more premium.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "c1",
          role: "user",
          text: "I liked the previous storyline tone.",
          createdAt: "2026-01-01T08:00:00.000Z",
          artifactId: pinned.artifactId,
        }),
        msg({
          id: "c2",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T08:05:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");

    const upstream = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === pinned.artifactId,
    );
    expect(upstream?.version).toBe(pinned.version);
    expect(JSON.stringify(upstream?.data)).toContain("EXACT_A5_PAYLOAD_MARKER");
    expect(JSON.stringify(upstream?.data)).not.toContain("OLD_APPROVAL_NOTE_ONLY");

    // Deictic may resolve via single candidate; either way WM must not be the artifact SoT
    expect(applied.request.workingMemory?.applied).toBe(true);
    const wmBlob = JSON.stringify(applied.request.workingMemory);
    expect(wmBlob).not.toContain("EXACT_A5_PAYLOAD_MARKER");

    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(flat).toContain("EXACT_A5_PAYLOAD_MARKER");
    expect(flat).toContain("===== WORKING MEMORY =====");
  });

  it("original-bug regression: Phase N A@v → N+1 has exact artifact + WM + instruction", async () => {
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
        objective: "PHASE_N_OUTPUT_A",
      } as unknown as Record<string, unknown>,
      requestId: "p7_bug_v1",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationStoryline(),
          objective: `PHASE_N_OUTPUT_A_V${v}`,
          truncationProofTail: "A5_TAIL_MARKER",
        } as unknown as Record<string, unknown>,
        requestId: `p7_bug_v${v}`,
      });
      latest = next.version.version;
    }
    markApproved(artifactId, 5, { organizationId: ORG, projectId: PROJ });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "short note — NOT the artifact",
      artifactId,
      artifactVersion: 5,
      expectedVersion: session.sessionVersion,
    });
    if (!ap.ok) throw new Error(ap.error.message);
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const instruction = "Use the previous output and make it more premium.";
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      conversationalInstruction: instruction,
      metadata: {
        ...presentationMeta(session.sessionId, "slide-content"),
        apiExecutionId: "exec_p7_bug",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p7_bug",
      conversationMessages: [
        msg({
          id: "b1",
          role: "user",
          text: "That storyline felt strong.",
          createdAt: "2026-01-02T10:00:00.000Z",
          artifactId,
        }),
        msg({
          id: "b2",
          role: "assistant",
          text: "Want to refine the tone?",
          createdAt: "2026-01-02T10:01:00.000Z",
        }),
        msg({
          id: "b3",
          role: "user",
          text: instruction,
          createdAt: "2026-01-02T10:02:00.000Z",
        }),
      ],
    });

    expect(proof.providerInvoked).toBe(true);
    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");

    const up = proof.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === artifactId && u.version === 5,
    );
    expect(up).toBeDefined();
    expect(JSON.stringify(up?.data)).toContain("PHASE_N_OUTPUT_A_V5");
    expect(JSON.stringify(up?.data)).toContain("A5_TAIL_MARKER");
    expect(proof.apply.request.currentUserInstruction).toBe(instruction);
    expect(proof.apply.request.workingMemory?.applied).toBe(true);
    const prevRef = proof.apply.request.referenceResolution?.references.find(
      (r) => r.referenceType === "previous_output",
    );
    expect(prevRef?.artifactId).toBe(artifactId);
    expect(prevRef?.version).toBe(5);

    expect(proof.providerPrompt).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(proof.providerPrompt).toContain(instruction);
    expect(proof.providerPrompt).toContain("===== WORKING MEMORY =====");
    expect(proof.providerPrompt).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(proof.providerPrompt).toContain("PHASE_N_OUTPUT_A_V5");
    expect(proof.providerPrompt).toContain("===== RESOLVED REFERENCES =====");

    const compiled = getLatestCanonicalTraceEvent("cdf.generation_context.compiled");
    const boundary = getLatestCanonicalTraceEvent(
      "cdf.generation_context.provider_boundary",
    );
    expect(
      compiled && "workingMemoryApplied" in compiled
        ? compiled.workingMemoryApplied
        : false,
    ).toBe(true);
    expect(
      boundary && "workingMemoryApplied" in boundary
        ? boundary.workingMemoryApplied
        : false,
    ).toBe(true);
    expect(compiled?.generationContextHash).toBe(boundary?.generationContextHash);
    expect(compiled?.executionId).toBe("exec_p7_bug");
    // No full memory dump in trace event stringification beyond counts
    expect(JSON.stringify(compiled)).not.toContain("That storyline felt strong");
  });

  it("flag OFF: legacy path unchanged (no working memory metadata)", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "legacy prompt body",
      conversationalInstruction: "Also make the CTA stronger.",
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "x",
          role: "user",
          text: "minimal style please",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error("ok");
    expect(applied.skipped).toBe(true);
    if (applied.skipped) {
      expect(applied.prompt).toBe("legacy prompt body");
      expect(applied.metadata.cdfWorkingMemoryApplied).toBeUndefined();
    }
  });

  it("full-deck still carries exact upstream artifacts with working memory", () => {
    let session = selectSource(startBrief());
    const story = approveStoryline(
      session,
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p7_fd_story",
    );
    session = story.session;
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
            id: "p7_s",
            order: 99,
            title: "P7_SLIDE",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "P7_SLIDE_CONTENT_EXACT",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p7_fd_slides",
    });
    markApproved(slides.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    let cur = applyCdfTransition({
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
      requestId: "p7_fd_route",
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
        name: "P7_DS_EXACT",
      } as unknown as Record<string, unknown>,
      requestId: "p7_fd_ds",
    });
    markSelected(ds.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    cur = applyCdfTransition({
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
        artifactId: slides.artifact.artifactId,
        version: 1,
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
    ]) {
      session = upsertSessionArtifactRef(session, ref);
    }
    saveCdfSession(session);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Build full deck",
      conversationalInstruction: "Compile the deck with the approved content.",
      metadata: presentationMeta(session.sessionId, "full-deck"),
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "fd1",
          role: "user",
          text: "Keep the selected design system.",
          createdAt: "2026-01-03T10:00:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.metadata.cdfOmitConceptsExpansion).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("P7_SLIDE_CONTENT_EXACT");
    expect(flat).toContain("P7_DS_EXACT");
    expect(flat).toContain("===== WORKING MEMORY =====");
  });

  it("provider mapping receives working memory only via CMR flatten", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p7_prov",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Polish the CTA.",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "p1",
          role: "user",
          text: "Prefer a stronger call to action wording.",
          createdAt: "2026-01-04T10:00:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const mapped = mapCanonicalModelRequestToProviderPayload(applied.modelRequest, {
      providerId: "openai",
    });
    expect(mapped.prompt).toContain("WORKING MEMORY");
    expect(mapped.prompt).toContain("stronger call to action");
    expect(mapped.prompt).toContain("Polish the CTA.");
  });

  it("default bounds are exposed and conservative", () => {
    expect(DEFAULT_WORKING_MEMORY_BOUNDS.maxTurns).toBe(6);
    expect(DEFAULT_WORKING_MEMORY_BOUNDS.maxCharacters).toBe(4000);
    expect(DEFAULT_WORKING_MEMORY_BOUNDS.candidateWindow).toBe(20);
  });
});
