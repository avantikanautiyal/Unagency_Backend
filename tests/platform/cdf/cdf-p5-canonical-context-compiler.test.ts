/**
 * Phase 5 — Complete CMR assembly (Production Spec + output requirements in CMR).
 * Proves no post-CMR application appends on the canonical path.
 */

import { pinGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";
import {
  applyCdfTransition,
  assembleCanonicalModelRequest,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  compileCanonicalGenerationRequest,
  compileCanonicalModelRequestFromGeneration,
  createArtifact,
  createVersion,
  detectCanonicalSectionsFromModelRequest,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCanonicalAssemblyEnrichments,
  resolveGenerationContext,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
  getLatestCanonicalTraceEvent,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
  mapCanonicalModelRequestToProviderPayload,
} from "../../../src/platform/ai/canonical-model-request";
import { PRODUCTION_PROMPT_BLOCK_HEADER } from "../../../src/platform/config/format-production-spec";
import * as productionInstruct from "../../../src/platform/config/format-production-spec/apply-production-spec-instruct";
import * as appendOutput from "../../../src/platform/direct/append-output-requirements";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { asOrganizationId } from "../../../src/platform/core/identifiers";

const ORG = "org_p5_asm";
const PROJ = "proj_p5_asm";
const MARKER = "P5_UPSTREAM_MARKER_AA11";
const END_MARKER = "P5_END_MARKER_TRUNCATION_BB22";
const CTI = "Make slide 4 more premium.";

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
    expectedVersion: (pinGeneratedForApprove({ sessionId: session.sessionId, artifactId: created.artifact.artifactId, version: created.version.version }), getCdfSession(session.sessionId)!.sessionVersion),
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
  outputKind: phaseId === "full-deck" ? "presentation" : undefined,
});

describe("Phase 5 Canonical Context Compiler / Complete CMR", () => {
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

  it("complete CMR contains instruction, requirements, CDF, upstream, Spec, output", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      largeStoryline(MARKER, END_MARKER) as unknown as Record<string, unknown>,
      "p5_complete",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);
    expect(applied.metadata.cdfCanonicalAssemblyComplete).toBe(true);
    expect(applied.metadata.cdfSkipPostCmrPromptAppends).toBe(true);

    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.currentUserInstruction).toBe(true);
    expect(sections.requirements).toBe(true);
    expect(sections.cdfPhase).toBe(true);
    expect(sections.upstreamArtifacts).toBe(true);
    expect(sections.outputContract).toBe(true);
    expect(sections.productionSpec).toBe(true);
    expect(sections.outputRequirements).toBe(true);
    expect(sections.activeBrief).toBe(true);
    expect(applied.metadata.cdfCanonicalProductionSpecPresent).toBe(true);
  });

  it("Production Spec lives in CMR and reaches provider exactly once", async () => {
    const ensureSpy = jest.spyOn(
      productionInstruct,
      "ensureProviderPromptHasProductionSpec",
    );
    const appendSpy = jest.spyOn(appendOutput, "appendOutputRequirementsToPrompt");

    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: MARKER,
      } as unknown as Record<string, unknown>,
      "p5_spec",
    );
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p5_spec_once",
    });
    expect(proof.providerInvoked).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");

    const parts = proof.apply.modelRequest.messages.flatMap((m) => m.content);
    const specPart = parts.find(
      (p) => p.type === "structured" && p.name === "production_spec",
    );
    expect(specPart).toBeDefined();
    expect(JSON.stringify(specPart)).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);

    const occurrences = proof.providerPrompt.split(PRODUCTION_PROMPT_BLOCK_HEADER)
      .length - 1;
    expect(occurrences).toBe(1);
    expect(proof.providerPrompt).toContain("===== PRODUCTION SPEC =====");
    expect(proof.providerPrompt).toContain("===== OUTPUT REQUIREMENTS =====");

    // Canonical DirectEngine path must not use legacy prompt append helpers.
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
    ensureSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it("output contract / requirements are in CMR (not a second append)", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p5_out",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== OUTPUT CONTRACT =====");
    expect(flat).toContain("===== OUTPUT REQUIREMENTS =====");
    expect(flat).toContain("[Output requirements]");
    const outCount = (flat.match(/\[Output requirements\]/g) ?? []).length;
    expect(outCount).toBe(1);
  });

  it("CTI instruction distinct; not duplicated into Spec/requirements", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: "CTI_UPSTREAM_MARKER",
      } as unknown as Record<string, unknown>,
      "p5_cti",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      metadata: {
        ...presentationMeta(pinned.session.sessionId, "slide-content"),
        conversationalEffectiveInstruction: CTI,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationalInstruction: CTI,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.currentUserInstruction).toBe(CTI);
    const text = applied.modelRequest.messages
      .flatMap((m) => m.content)
      .filter(
        (p) => p.type === "text" && p.semanticRole === "current_user_instruction",
      );
    expect(text).toHaveLength(1);
    expect((text[0] as { text: string }).text).toBe(CTI);

    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    const ctiInInstruction = flat.includes(
      `===== CURRENT USER INSTRUCTION =====\n${CTI}`,
    );
    expect(ctiInInstruction).toBe(true);
    // Spec block should not absorb CTI as its primary content
    const specIdx = flat.indexOf("===== PRODUCTION SPEC =====");
    const instrIdx = flat.indexOf("===== CURRENT USER INSTRUCTION =====");
    expect(instrIdx).toBeGreaterThanOrEqual(0);
    expect(flat).toContain("CTI_UPSTREAM_MARKER");
    if (specIdx >= 0) {
      const specSlice = flat.slice(specIdx, instrIdx > specIdx ? instrIdx : undefined);
      expect(specSlice).not.toContain(CTI);
    }
  });

  it("exact version v3 pin; long artifact end marker; determinism", () => {
    let session = selectSource(startBrief());
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStoryline("VERSION_ONE", END_MARKER) as unknown as Record<
        string,
        unknown
      >,
      requestId: "p5_v1",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (const marker of ["VERSION_TWO", "VERSION_THREE"]) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStoryline(marker, END_MARKER) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p5_${marker}`,
      });
      latest = next.version.version;
    }
    markApproved(artifactId, 3, { organizationId: ORG, projectId: PROJ });
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
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
    createVersion({
      artifactId,
      expectedLatestVersion: 3,
      organizationId: ORG,
      projectId: PROJ,
      data: largeStoryline("VERSION_FOUR", "NO") as unknown as Record<string, unknown>,
      requestId: "p5_v4",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 3,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const a = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    const b = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || a.skipped || !b.ok || b.skipped) throw new Error("expected");
    expect(a.request.generationContextHash).toBe(b.request.generationContextHash);
    const up = a.modelRequest.messages
      .flatMap((m) => m.content)
      .find((p) => p.type === "structured" && p.name === "upstream_artifact");
    expect(up && up.type === "structured").toBe(true);
    if (!up || up.type !== "structured") return;
    expect((up.data as { version: number }).version).toBe(3);
    const raw = JSON.stringify((up.data as { data: unknown }).data);
    expect(raw).toContain("VERSION_THREE");
    expect(raw).not.toContain("VERSION_FOUR");
    expect(raw).toContain(END_MARKER);
    expect(raw.length).toBeGreaterThan(1500);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(a.modelRequest);
    expect(flat).toContain(END_MARKER);
    expect(flat).toContain("VERSION_THREE");
  });

  it("full-deck CMR includes upstream + Spec + output; concepts omitted", () => {
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
        objective: "P5_STORY",
      } as unknown as Record<string, unknown>,
      requestId: "p5_fd_story",
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
            id: "p5_s",
            order: 99,
            title: "P5_SLIDE_MARKER",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "P5_SLIDE_MARKER",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p5_fd_slides",
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
      requestId: "p5_fd_route",
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
        name: "P5_DS_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p5_fd_ds",
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
        artifactId: story.artifact.artifactId,
        version: 1,
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
      metadata: presentationMeta(session.sessionId, "full-deck"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.metadata.cdfOmitConceptsExpansion).toBe(true);
    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.productionSpec).toBe(true);
    expect(sections.outputContract).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("P5_SLIDE_MARKER");
    expect(flat).toContain("P5_DS_MARKER");
    expect(flat).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
  });

  it("provider-boundary trace: Spec + output + hash consistency", async () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      {
        ...fixturePresentationStoryline(),
        objective: MARKER,
      } as unknown as Record<string, unknown>,
      "p5_trace",
    );
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate",
      metadata: presentationMeta(pinned.session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p5_trace",
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
    expect(boundary.canonicalModelRequestApplied).toBe(true);
    expect(boundary.productionSpecPresent).toBe(true);
    expect(boundary.outputContractPresent).toBe(true);
    expect(boundary.upstreamArtifacts.length).toBeGreaterThan(0);
    expect(boundary.generationContextHash).toBe(compiled.generationContextHash);
    expect(boundary.executionId).toBe("exec_p5_trace");
    expect(boundary.cdfSessionId).toBe(compiled.cdfSessionId);
    expect(boundary.cdfPhaseId).toBe(compiled.cdfPhaseId);
  });

  it("flag OFF legacy path unchanged; non-CDF DirectEngine still appends", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacy = "Legacy prompt body";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: legacy,
      metadata: presentationMeta(session.sessionId, "slide-content"),
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.skipped).toBe(true);
    expect(applied.prompt).toBe(legacy);

    const ensureSpy = jest.spyOn(
      productionInstruct,
      "ensureProviderPromptHasProductionSpec",
    );
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const runtime = createProviderRuntime({ dispatcher });
    const engine = createDirectExecutionEngine({ runtime });
    const result = await engine.run({
      requestId: "req_p5_legacy",
      rawPrompt: "Hello non-CDF",
      organizationId: asOrganizationId(ORG),
      metadata: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(String(result.error.message));
    }
    expect(ensureSpy).toHaveBeenCalled();
    ensureSpy.mockRestore();
  });

  it("assembleCanonicalModelRequest is pure transform of enrichments", () => {
    const pinned = approveStoryline(
      selectSource(startBrief()),
      fixturePresentationStoryline() as unknown as Record<string, unknown>,
      "p5_pure",
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
    const enrichments = resolveCanonicalAssemblyEnrichments({
      service: "Presentations",
      cdfServiceId: "presentation",
    });
    const mr = assembleCanonicalModelRequest(gen, enrichments);
    const projected = mapCanonicalModelRequestToProviderPayload(mr);
    expect(projected.prompt).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    // Without enrichments, Spec absent
    const bare = compileCanonicalModelRequestFromGeneration(gen);
    expect(
      bare.messages.some((m) =>
        m.content.some((p) => p.type === "structured" && p.name === "production_spec"),
      ),
    ).toBe(false);
  });
});
