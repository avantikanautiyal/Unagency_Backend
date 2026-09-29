/**
 * Phase 4 — CanonicalModelRequest structure + provider-compat flattening.
 */

import {
  applyCdfTransition,
  compileCanonicalGenerationRequest,
  createArtifact,
  createVersion,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveGenerationContext,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  resetCanonicalGenerationTracesForTests,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
  mapCanonicalModelRequestToProviderPayload,
} from "../../../src/platform/ai/canonical-model-request";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import * as bindPrompt from "../../../src/platform/cdf/generation-context/bind-prompt";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";

const ORG = "org_p4_cmr";
const PROJ = "proj_p4_cmr";
const MARKER = "P4_STRUCTURED_MARKER_9F31";
const END_MARKER = "P4_END_MARKER_TRUNCATION_ZZ99";

function allParts(
  mr: { messages: ReadonlyArray<{ content: readonly unknown[] }> },
) {
  return mr.messages.flatMap((m) => m.content) as Array<
    | { type: "text"; text: string; semanticRole?: string }
    | {
        type: "structured";
        name: string;
        data: unknown;
        semanticRole?: string;
      }
  >;
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

function largeStoryline(start: string, end: string) {
  const base = fixturePresentationStoryline();
  const pad = "PAD_".repeat(500);
  return {
    ...base,
    objective: `${start} ${pad}`,
    notes: `${start}_NOTES ${pad}`,
    truncationProofTail: end,
    nested: { deep: { arr: [1, 2, { tail: end }] } },
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
    note: "OLD_NOTE",
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

describe("Phase 4 Canonical Model Request", () => {
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

  it("Generation→ModelRequest preserves separate semantic parts", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStoryline(MARKER, END_MARKER) as unknown as Record<string, unknown>,
      "p4_parts",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);
    const mr = applied.modelRequest;
    expect(mr.messages.length).toBeGreaterThanOrEqual(1);
    const parts = allParts(mr);
    expect(
      parts.some(
        (p) => p.type === "text" && p.semanticRole === "current_user_instruction",
      ),
    ).toBe(true);
    expect(parts.some((p) => p.type === "structured" && p.name === "requirements")).toBe(
      true,
    );
    expect(parts.some((p) => p.type === "structured" && p.name === "cdf_context")).toBe(
      true,
    );
    expect(
      parts.some((p) => p.type === "structured" && p.name === "upstream_artifact"),
    ).toBe(true);
    expect(
      parts.some((p) => p.type === "structured" && p.name === "output_contract"),
    ).toBe(true);
    expect(mr.metadata?.generationContextHash).toBe(
      applied.request.generationContextHash,
    );
  });

  it("compileCanonicalGenerationRequest does not call bind (no app flatten)", () => {
    const bindSpy = jest.spyOn(bindPrompt, "bindCanonicalGenerationRequestToPrompt");
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p4_no_bind",
    );
    const session = pinned.session;
    const resolved = resolveGenerationContext({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "slide-content",
      currentUserInstruction: "Generate",
      expectedSessionVersion: session.sessionVersion,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const gen = compileCanonicalGenerationRequest({
      resolved: resolved.context,
      upstream: [],
      currentUserInstruction: "Generate",
      canonicalFullDeck: false,
    });
    compileCanonicalModelRequestFromGeneration(gen);
    expect(bindSpy).not.toHaveBeenCalled();
    bindSpy.mockRestore();
  });

  it("apply path does not invoke bind; only provider flatten does", () => {
    const bindSpy = jest.spyOn(bindPrompt, "bindCanonicalGenerationRequestToPrompt");
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p4_apply_no_bind",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    expect(bindSpy).not.toHaveBeenCalled();
    bindSpy.mockRestore();
  });

  it("exact artifact v3 pin preserved in ModelRequest (not v4)", () => {
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
        objective: "VERSION_ONE",
      } as unknown as Record<string, unknown>,
      requestId: "p4_v1",
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
        requestId: `p4_${marker}`,
      });
      latest = next.version.version;
    }
    markApproved(artifactId, 3, { organizationId: ORG, projectId: PROJ });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
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
        objective: "VERSION_FOUR",
      } as unknown as Record<string, unknown>,
      requestId: "p4_v4",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 3,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Build slides",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const up = allParts(applied.modelRequest).find(
      (p) => p.type === "structured" && p.name === "upstream_artifact",
    );
    expect(up && up.type === "structured").toBe(true);
    if (!up || up.type !== "structured") return;
    const data = up.data as Record<string, unknown>;
    expect(data.version).toBe(3);
    expect(data.artifactId).toBe(artifactId);
    expect(JSON.stringify(data.data)).toContain("VERSION_THREE");
    expect(JSON.stringify(data.data)).not.toContain("VERSION_FOUR");
  });

  it("structured >1500 artifact remains in ModelRequest (end marker)", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStoryline(MARKER, END_MARKER) as unknown as Record<string, unknown>,
      "p4_big",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const up = allParts(applied.modelRequest).find(
      (p) => p.type === "structured" && p.name === "upstream_artifact",
    );
    expect(up && up.type === "structured").toBe(true);
    if (!up || up.type !== "structured") return;
    const raw = JSON.stringify((up.data as { data: unknown }).data);
    expect(raw.length).toBeGreaterThan(1500);
    expect(raw).toContain(END_MARKER);
    expect(raw).toContain(MARKER);
  });

  it("provider flatten labels sections; ModelRequest stays structured", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStoryline(MARKER, END_MARKER) as unknown as Record<string, unknown>,
      "p4_flat",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const projected = mapCanonicalModelRequestToProviderPayload(applied.modelRequest);
    expect(projected.flattenedByProvider).toBe(true);
    expect(projected.prompt).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(projected.prompt).toContain("===== REQUIREMENTS =====");
    expect(projected.prompt).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(projected.prompt).toContain("===== OUTPUT CONTRACT =====");
    expect(projected.prompt).toContain(END_MARKER);
    // Structured SoT unchanged
    expect(
      allParts(applied.modelRequest).some(
        (p) => p.type === "structured" && p.name === "upstream_artifact",
      ),
    ).toBe(true);
  });

  it("OpenAI + Anthropic mappers consume CanonicalModelRequest", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: MARKER,
      } as unknown as Record<string, unknown>,
      "p4_mappers",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");

    const execReq = {
      ...sampleRequest({
        requestId: "p4_wire",
        providerId: "provider.openai",
        payload: {
          canonicalModelRequest: applied.modelRequest,
        },
      }),
      capabilityId: "text.generate",
      modelId: "gpt-4o",
      metadata: applied.metadata,
    };
    const adapterReq = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const openaiWire = mapCanonicalToOpenAIRequest(adapterReq, "gpt-4o");
    const oaiMessages = (openaiWire.body as { messages: Array<{ content: string }> })
      .messages;
    expect(oaiMessages.map((m) => m.content).join("\n")).toContain(MARKER);

    const anthAdapter = toAdapterRequestFromExecution({
      request: {
        ...execReq,
        providerId: "provider.anthropic",
      } as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const anthWire = mapCanonicalToAnthropicRequest(anthAdapter, "claude-3-5-sonnet-latest");
    const anthMessages = (anthWire.body as { messages: Array<{ content: string }> })
      .messages;
    expect(anthMessages.map((m) => String(m.content)).join("\n")).toContain(MARKER);
  });

  it("CTI instruction remains distinct from upstream structured parts", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "CTI_UPSTREAM_MARKER",
      } as unknown as Record<string, unknown>,
      "p4_cti",
    );
    const cti = "Make slide 4 more premium.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: cti,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationalInstruction: cti,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(cti);
    const textParts = allParts(applied.modelRequest).filter(
      (p) => p.type === "text" && p.semanticRole === "current_user_instruction",
    );
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe(cti);
    expect(
      allParts(applied.modelRequest).some(
        (p) => p.type === "structured" && p.name === "upstream_artifact",
      ),
    ).toBe(true);
    expect(
      allParts(applied.modelRequest).some(
        (p) => p.type === "structured" && p.name === "requirements",
      ),
    ).toBe(true);
    expect(
      allParts(applied.modelRequest).some(
        (p) => p.type === "structured" && p.name === "cdf_context",
      ),
    ).toBe(true);
    expect(
      allParts(applied.modelRequest).some(
        (p) => p.type === "structured" && p.name === "output_contract",
      ),
    ).toBe(true);
  });

  it("full-deck ModelRequest includes slide-content + design-system exact pins", () => {
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
      requestId: "p4_fd_story",
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
            id: "slide_p4",
            order: 99,
            title: "P4_SLIDE_CONTENT_MARKER",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "P4_SLIDE_CONTENT_MARKER body",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p4_fd_slides",
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
      requestId: "p4_fd_route",
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
        name: "P4_DESIGN_SYSTEM_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p4_fd_ds",
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

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Build full deck",
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
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.outputContract.canonicalFullDeck).toBe(true);
    expect(applied.metadata.cdfOmitConceptsExpansion).toBe(true);
    const ups = allParts(applied.modelRequest).filter(
      (p) => p.type === "structured" && p.name === "upstream_artifact",
    );
    const keys = ups.map((p) =>
      p.type === "structured"
        ? String((p.data as { artifactKey?: string }).artifactKey)
        : "",
    );
    expect(keys).toContain(PRESENTATION_ARTIFACT_KEYS.slideContent);
    expect(keys).toContain(PRESENTATION_ARTIFACT_KEYS.designSystem);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("P4_SLIDE_CONTENT_MARKER");
    expect(flat).toContain("P4_DESIGN_SYSTEM_MARKER");
  });

  it("flag OFF legacy path unchanged; DirectEngine non-CDF still works", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacy = "Legacy prompt without canonical model request";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: legacy,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.skipped).toBe(true);
    expect(applied.prompt).toBe(legacy);
    expect(applied.metadata.cdfCanonicalModelRequestApplied).not.toBe(true);

    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const runtime = createProviderRuntime({ dispatcher });
    const engine = createDirectExecutionEngine({ runtime });
    const result = await engine.run({
      requestId: "req_p4_legacy_direct",
      rawPrompt: "Hello non-CDF direct engine",
      organizationId: asOrganizationId(ORG),
    });
    expect(result.ok).toBe(true);
    expect(dispatcher.attempts).toBeGreaterThan(0);
  });

  it("runtime: DirectEngine flattens CMR at provider boundary", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStoryline(MARKER, END_MARKER) as unknown as Record<string, unknown>,
      "p4_runtime",
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
      executionId: "exec_p4_runtime",
    });
    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");
    expect(proof.apply.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);
    expect(proof.providerInvoked).toBe(true);
    expect(proof.providerPrompt).toContain(MARKER);
    expect(proof.providerPrompt).toContain(END_MARKER);
    expect(proof.providerPrompt).toContain("===== UPSTREAM ARTIFACTS =====");
    const boundary = proof.boundaryTrace;
    expect(boundary?.event).toBe("cdf.generation_context.provider_boundary");
    if (boundary?.event === "cdf.generation_context.provider_boundary") {
      expect(boundary.canonicalModelRequestApplied).toBe(true);
      expect(boundary.flattenedByProvider).toBe(true);
      expect(boundary.generationContextHash).toBe(
        proof.apply.request.generationContextHash,
      );
    }
  });
});
