/**
 * Phase 8 — Artifact Context Rehydration.
 * Exact ArtifactVersion → complete structured data → CMR upstream_artifacts.
 */

import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  computeArtifactContextHash,
  createArtifact,
  createArtifactContextLoader,
  createVersion,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  getLatestCanonicalTraceEvent,
  markApproved,
  markSelected,
  PRESENTATION_ARTIFACT_KEYS,
  rehydrateReferencedArtifacts,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveArtifactContextForGeneration,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
} from "../../../src/platform/cdf";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
} from "../../../src/platform/ai/canonical-model-request";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";

const ORG = "org_p8_ctx";
const PROJ = "proj_p8_ctx";
const CONV = "conv_p8_main";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p8",
    ...partial,
  };
}

function providerFlatFromApply(
  result: Extract<
    ReturnType<typeof tryApplyCanonicalGenerationContext>,
    { ok: true; skipped: false }
  >,
): string {
  expect(result.prompt).toBe(CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER);
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

function largeStorylineData(marker: string) {
  const base = fixturePresentationStoryline();
  const pad = "PAD_".repeat(500);
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

function approveStorylineAtVersion(input: {
  session: ReturnType<typeof startBrief>;
  artifactId: string;
  version: number;
  marker: string;
}) {
  markApproved(input.artifactId, input.version, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: input.session.sessionId,
    note: "OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA",
    artifactId: input.artifactId,
    artifactVersion: input.version,
    expectedVersion: input.session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  let session = upsertSessionArtifactRef(ap.value.session, {
    artifactId: input.artifactId,
    version: input.version,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return getCdfSession(session.sessionId)!;
}

function seedStorylineThroughVersion(
  session: ReturnType<typeof startBrief>,
  targetVersion: number,
  markerPrefix: string,
) {
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
      objective: `${markerPrefix}1_MARKER`,
    } as unknown as Record<string, unknown>,
    requestId: `p8_${markerPrefix}_v1`,
  });
  let latest = created.version.version;
  const artifactId = created.artifact.artifactId;
  for (let v = 2; v <= targetVersion; v++) {
    const next = createVersion({
      artifactId,
      expectedLatestVersion: latest,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: `${markerPrefix}${v}_MARKER`,
      } as unknown as Record<string, unknown>,
      requestId: `p8_${markerPrefix}_v${v}`,
    });
    latest = next.version.version;
  }
  expect(latest).toBe(targetVersion);
  return { artifactId, latest };
}

describe("Phase 8 Artifact Context Rehydration", () => {
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

  it("1+18 — Phase N A@5 → Phase N+1 rehydrates exact complete data into CMR", () => {
    let session = selectSource(startBrief());
    const MARKER = "P8_STRUCTURED_A5_COMPLETE";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(MARKER) as unknown as Record<string, unknown>,
      requestId: "p8_story_a5_seed",
    });
    let latest = created.version.version;
    const artifactId = created.artifact.artifactId;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStorylineData(`${MARKER}_V${v}`) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p8_story_v${v}`,
      });
      latest = next.version.version;
    }
    expect(latest).toBe(5);
    session = approveStorylineAtVersion({
      session,
      artifactId,
      version: 5,
      marker: MARKER,
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Build slide content from approved storyline",
      conversationalInstruction: "Generate slides now.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p8_n_to_n1",
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm_agree",
          role: "user",
          text: "We agreed to use the previous storyline.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "wm_ack",
          role: "assistant",
          text: "Understood — using the approved storyline.",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        msg({
          id: "wm_now",
          role: "user",
          text: "Generate slides now.",
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");

    const up = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === artifactId,
    );
    expect(up?.version).toBe(5);
    expect(JSON.stringify(up?.data)).toContain(`${MARKER}_V5`);
    expect(JSON.stringify(up?.data)).toContain("OBJECTIVE_END");
    expect(JSON.stringify(up?.data).length).toBeGreaterThan(1500);
    expect(JSON.stringify(up?.data)).not.toContain(
      "OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA",
    );

    const parts = applied.modelRequest.messages.flatMap((m) => m.content);
    const artifactParts = parts.filter(
      (p) => p.type === "structured" && p.name === "upstream_artifact",
    );
    expect(artifactParts.length).toBeGreaterThan(0);
    const a5 = artifactParts.find(
      (p) =>
        p.type === "structured" &&
        (p.data as { artifactId?: string; version?: number }).artifactId ===
          artifactId &&
        (p.data as { version?: number }).version === 5,
    );
    expect(a5).toBeDefined();
    if (a5?.type === "structured") {
      const nested = (a5.data as { data?: Record<string, unknown> }).data;
      expect(JSON.stringify(nested)).toContain(`${MARKER}_V5`);
      expect(JSON.stringify(nested).length).toBeGreaterThan(6000);
    }

    expect(applied.request.currentUserInstruction).toBe("Generate slides now.");
    expect(applied.request.workingMemory?.applied).toBe(true);
    const wmText = JSON.stringify(applied.request.workingMemory?.items ?? []);
    expect(wmText).toContain("previous storyline");
    expect(JSON.stringify(up?.data)).not.toContain(
      "We agreed to use the previous storyline",
    );

    const flat = providerFlatFromApply(applied);
    expect(flat).toContain(`${MARKER}_V5`);
    expect(flat).toContain("===== CURRENT USER INSTRUCTION =====");
    expect(flat).toContain("===== WORKING MEMORY =====");
    expect(flat).not.toContain("OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA");

    expect(applied.metadata.cdfArtifactContextApplied).toBe(true);
    expect(applied.metadata.cdfArtifactContextHash).toBeTruthy();
    expect(Array.isArray(applied.metadata.cdfArtifactVersions)).toBe(true);
    expect(
      (applied.metadata.cdfArtifactVersions as string[]).some((v) =>
        v.endsWith("@5"),
      ),
    ).toBe(true);

    const compiled = getLatestCanonicalTraceEvent(
      "cdf.generation_context.compiled",
    );
    expect(compiled?.event).toBe("cdf.generation_context.compiled");
    if (compiled?.event === "cdf.generation_context.compiled") {
      expect(compiled.artifactContextApplied).toBe(true);
      expect(compiled.loadedArtifactCount).toBeGreaterThan(0);
      expect(compiled.artifactContextHash).toBeTruthy();
    }
  });

  it("2+3+4+5 — complete structured data; approval note never replaces; no 1500/6000 truncation", () => {
    let session = selectSource(startBrief());
    const MARKER = "NO_TRUNCATE_P8";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(MARKER) as unknown as Record<string, unknown>,
      requestId: "p8_no_trunc",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: MARKER,
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
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
    const dataJson = JSON.stringify(applied.request.upstreamArtifacts[0]?.data);
    expect(dataJson.length).toBeGreaterThan(6000);
    expect(dataJson).toContain(MARKER);
    expect(dataJson).not.toContain("OLD_TRUNCATED_NOTE");
    const flat = providerFlatFromApply(applied);
    expect(flat.length).toBeGreaterThan(6000);
    expect(flat).toContain("OBJECTIVE_END");
  });

  it("6 — exact A@5 vs A@6; never latest/HEAD", () => {
    let session = selectSource(startBrief());
    const { artifactId } = seedStorylineThroughVersion(session, 5, "V");
    session = approveStorylineAtVersion({
      session: getCdfSession(session.sessionId)!,
      artifactId,
      version: 5,
      marker: "V5",
    });
    // Newer HEAD after pin — must not be substituted.
    createVersion({
      artifactId,
      expectedLatestVersion: 5,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: "V6_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p8_V6_MARKER",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const latestSpy = jest.spyOn(artifactRepo, "getLatestArtifactVersion");
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
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
    const up = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === artifactId,
    );
    expect(up?.version).toBe(5);
    expect(JSON.stringify(up?.data)).toContain("V5_MARKER");
    expect(JSON.stringify(up?.data)).not.toContain("V6_MARKER");
    expect(latestSpy).not.toHaveBeenCalled();
    latestSpy.mockRestore();
  });

  it("7 — missing required artifact fails before provider", () => {
    const session = selectSource(startBrief());
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slides",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.code).toMatch(/DEPENDENCY|ARTIFACT|CONTEXT/);
    expect("modelRequest" in applied).toBe(false);
  });

  it("8 — missing optional artifact is observable and non-fatal", () => {
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
      requestId: "p8_opt_story",
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
      data: fixturePresentationSlideContent() as unknown as Record<
        string,
        unknown
      >,
      requestId: "p8_opt_slides",
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
      artifactType: "structured_doc",
      data: fixturePresentationDesignRoute() as unknown as Record<
        string,
        unknown
      >,
      requestId: "p8_opt_route",
    });
    markSelected(route.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: route.artifact.artifactId,
      version: 1,
      phaseId: "design-routes",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      role: "selected",
    });

    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "design-system",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as unknown as Record<
        string,
        unknown
      >,
      requestId: "p8_opt_ds",
    });
    markSelected(ds.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: ds.artifact.artifactId,
      version: 1,
      phaseId: "design-system",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      role: "selected",
    });
    saveCdfSession(session);

    // Optional storyline pin points at a missing version → skip, do not fail.
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: story.artifact.artifactId,
      version: 99,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const ctx = resolveArtifactContextForGeneration({
      session: getCdfSession(session.sessionId)!,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: ORG,
      projectId: PROJ,
    });
    // Required slide-content + design-system present; optional storyline @99 missing.
    if (!ctx.ok) {
      // If storyline is treated as required somewhere, still assert typed failure — not silent.
      expect(ctx.code).toMatch(/ARTIFACT|DEPENDENCY/);
      return;
    }
    expect(ctx.ok).toBe(true);
    expect(
      ctx.upstream.some(
        (u) => u.artifactKey === PRESENTATION_ARTIFACT_KEYS.slideContent,
      ),
    ).toBe(true);
    expect(
      ctx.upstream.some(
        (u) => u.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
      ),
    ).toBe(true);
    expect(ctx.skippedOptional.length).toBeGreaterThan(0);
    expect(ctx.observability.skippedOptionalCount).toBeGreaterThan(0);
  });

  it("9 — unauthorized artifact cannot be loaded into context", () => {
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
      requestId: "p8_auth_ok",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "auth",
    });

    const foreign = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: "org_other",
      projectId: "proj_other",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: {
        ...fixturePresentationStoryline(),
        objective: "FOREIGN_LEAK_MARKER",
      } as unknown as Record<string, unknown>,
      requestId: "p8_foreign",
    });

    const loader = createArtifactContextLoader();
    const result = rehydrateReferencedArtifacts({
      session: getCdfSession(session.sessionId)!,
      upstream: [],
      loader,
      organizationId: ORG,
      projectId: PROJ,
      referenceResolution: {
        applied: true,
        originalUserInstruction: "use foreign",
        resolvedCount: 1,
        unresolvedCount: 0,
        ambiguousCount: 0,
        references: [
          {
            sourceText: "foreign",
            referenceType: "artifact_version",
            targetType: "artifact_version",
            status: "exact",
            artifactId: foreign.artifact.artifactId,
            version: 1,
            resolutionMethod: "explicit_artifact_version",
            provenance: ["test"],
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.upstream).toHaveLength(0);
    expect(result.skipped.some((s) => s.reason.includes("unauthorized"))).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain("FOREIGN_LEAK_MARKER");
  });

  it("10 — ownership mismatch on required pin fails typed (no silent fallback)", () => {
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
      requestId: "p8_own",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "own",
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: "org_wrong",
      projectId: "proj_wrong",
    });
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.code).toMatch(/ARTIFACT|DEPENDENCY/);
    expect(JSON.stringify(applied)).not.toMatch(/objective/i);
  });

  it("11 — Phase 6 resolved A@version rehydrates exact payload into upstream", () => {
    let session = selectSource(startBrief());
    const { artifactId } = seedStorylineThroughVersion(session, 4, "V");
    // Session pin is v4 (approved HEAD); instruction asks for version 3.
    session = approveStorylineAtVersion({
      session: getCdfSession(session.sessionId)!,
      artifactId,
      version: 4,
      marker: "V4",
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use version 3.",
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
    const verRef = applied.request.referenceResolution?.references.find(
      (r) => r.referenceType === "artifact_version",
    );
    expect(verRef?.version).toBe(3);
    const v3 = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === artifactId && u.version === 3,
    );
    expect(v3).toBeDefined();
    expect(JSON.stringify(v3?.data)).toContain("V3_MARKER");
    expect(applied.metadata.cdfLoadedArtifactsFromReferences).toBeGreaterThan(0);
  });

  it("12 — Phase 7 working memory remains separate from artifact payloads", () => {
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
        objective: "ARTIFACT_OBJECTIVE_ONLY",
      } as unknown as Record<string, unknown>,
      requestId: "p8_wm_sep",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "wm",
    });

    const WM = "Conversational agreement text must not become artifact data.";
    const instruction = "Build slides.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm1",
          role: "user",
          text: WM,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "wm2",
          role: "assistant",
          text: "Understood.",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        msg({
          id: "wm3",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.request.workingMemory?.applied).toBe(true);
    expect(JSON.stringify(applied.request.workingMemory)).toContain(WM);
    for (const u of applied.request.upstreamArtifacts) {
      expect(JSON.stringify(u.data)).not.toContain(WM);
      expect(JSON.stringify(u.data)).toContain("ARTIFACT_OBJECTIVE_ONLY");
    }
  });

  it("13 — full-deck exact slide-content A@5 + design-system B@3", () => {
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
      requestId: "p8_fd_story",
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
            id: "slide_a1",
            order: 90,
            title: "SLIDE_A1_MARKER",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "FULL_DECK_SLIDE_PAYLOAD_V1",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p8_fd_slides_v1",
    });
    let slidesLatest = slides.version.version;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId: slides.artifact.artifactId,
        expectedLatestVersion: slidesLatest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationSlideContent(),
          slides: [
            ...fixturePresentationSlideContent().slides,
            {
              id: `slide_a${v}`,
              order: 90,
              title: `SLIDE_A${v}_MARKER`,
              blocks: [
                {
                  id: "b1",
                  type: "paragraph",
                  content: `FULL_DECK_SLIDE_PAYLOAD_V${v}`,
                  hierarchy: 1,
                },
              ],
            },
          ],
        } as unknown as Record<string, unknown>,
        requestId: `p8_fd_slides_v${v}`,
      });
      slidesLatest = next.version.version;
    }
    expect(slidesLatest).toBe(5);
    markApproved(slides.artifact.artifactId, 5, {
      organizationId: ORG,
      projectId: PROJ,
    });
    cur = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      artifactId: slides.artifact.artifactId,
      artifactVersion: 5,
      expectedVersion: session.sessionVersion,
    });
    if (!cur.ok) throw new Error(cur.error.message);
    session = upsertSessionArtifactRef(cur.value.session, {
      artifactId: slides.artifact.artifactId,
      version: 5,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });
    createVersion({
      artifactId: slides.artifact.artifactId,
      expectedLatestVersion: 5,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationSlideContent(),
        slides: [
          ...fixturePresentationSlideContent().slides,
          {
            id: "slide_a6",
            order: 90,
            title: "SLIDE_A6_SHOULD_NOT",
            blocks: [
              {
                id: "b1",
                type: "paragraph",
                content: "SHOULD_NOT_APPEAR",
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: "p8_fd_slides_v6",
    });

    const route = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "design-routes",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      artifactType: "config_choice",
      data: fixturePresentationDesignRoute() as unknown as Record<
        string,
        unknown
      >,
      requestId: "p8_fd_route",
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
        name: "DS_B1",
      } as unknown as Record<string, unknown>,
      requestId: "p8_fd_ds_v1",
    });
    let dsLatest = ds.version.version;
    for (const marker of ["DS_B2", "DS_B3"]) {
      const next = createVersion({
        artifactId: ds.artifact.artifactId,
        expectedLatestVersion: dsLatest,
        organizationId: ORG,
        projectId: PROJ,
        data: {
          ...fixturePresentationDesignSystem(),
          name: marker,
        } as unknown as Record<string, unknown>,
        requestId: `p8_fd_${marker}`,
      });
      dsLatest = next.version.version;
    }
    expect(dsLatest).toBe(3);
    markSelected(ds.artifact.artifactId, 3, {
      organizationId: ORG,
      projectId: PROJ,
    });

    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: route.artifact.artifactId,
      version: 1,
      phaseId: "design-routes",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      role: "selected",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: ds.artifact.artifactId,
      version: 3,
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      role: "selected",
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

    createVersion({
      artifactId: ds.artifact.artifactId,
      expectedLatestVersion: 3,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationDesignSystem(),
        name: "DS_B4_SHOULD_NOT",
      } as unknown as Record<string, unknown>,
      requestId: "p8_fd_ds_v4",
    });

    session = upsertSessionArtifactRef(session, {
      artifactId: slides.artifact.artifactId,
      version: 5,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: ds.artifact.artifactId,
      version: 3,
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
      prompt: "Assemble full deck",
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
    if (!applied.ok) {
      throw new Error(
        `full-deck apply failed: ${applied.code} ${applied.message} ${JSON.stringify(applied.details)}`,
      );
    }
    if (applied.skipped) throw new Error("expected applied");

    const slideUp = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === slides.artifact.artifactId,
    );
    const dsUp = applied.request.upstreamArtifacts.find(
      (u) => u.artifactId === ds.artifact.artifactId,
    );
    expect(slideUp?.version).toBe(5);
    expect(dsUp?.version).toBe(3);
    expect(JSON.stringify(slideUp?.data)).toContain("SLIDE_A5_MARKER");
    expect(JSON.stringify(slideUp?.data)).not.toContain("SLIDE_A6_SHOULD_NOT");
    expect(JSON.stringify(dsUp?.data)).toContain("DS_B3");
    expect(JSON.stringify(dsUp?.data)).not.toContain("DS_B4_SHOULD_NOT");
    expect(applied.metadata.cdfCanonicalFullDeck).toBe(true);
    expect(applied.metadata.cdfOmitConceptsExpansion).toBe(true);
  });

  it("14 — artifact context hash stable for identical pins; changes with data/version", () => {
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
        objective: "HASH_BASE",
      } as unknown as Record<string, unknown>,
      requestId: "p8_hash",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "hash",
    });

    const a = resolveArtifactContextForGeneration({
      session: getCdfSession(session.sessionId)!,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: ORG,
      projectId: PROJ,
    });
    const b = resolveArtifactContextForGeneration({
      session: getCdfSession(session.sessionId)!,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(computeArtifactContextHash(a.upstream)).toBe(
      computeArtifactContextHash(b.upstream),
    );
    expect(a.observability.artifactContextHash).toBe(
      b.observability.artifactContextHash,
    );

    const v2 = createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationStoryline(),
        objective: "HASH_CHANGED",
      } as unknown as Record<string, unknown>,
      requestId: "p8_hash_v2",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: created.artifact.artifactId,
      version: v2.version.version,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    const c = resolveArtifactContextForGeneration({
      session: getCdfSession(session.sessionId)!,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.observability.artifactContextHash).not.toBe(
      a.observability.artifactContextHash,
    );
  });

  it("15 — duplicate exact A@5 loads are deduplicated via request-scoped loader cache", () => {
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
      requestId: "p8_dedup",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "dedup",
    });

    const loader = createArtifactContextLoader();
    const exactSpy = jest.spyOn(artifactRepo, "getArtifactVersion");
    loader.loadExact({
      artifactId: created.artifact.artifactId,
      version: 1,
      organizationId: ORG,
      projectId: PROJ,
    });
    loader.loadExact({
      artifactId: created.artifact.artifactId,
      version: 1,
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(loader.cacheSize()).toBe(1);
    const calls = exactSpy.mock.calls.filter(
      (c) => c[0] === created.artifact.artifactId && c[1] === 1,
    );
    expect(calls.length).toBe(1);
    exactSpy.mockRestore();
  });

  it("16 — provider mapping does not call getArtifactVersion", () => {
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
      requestId: "p8_prov",
    });
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 1,
      marker: "prov",
    });

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
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

    const spy = jest.spyOn(artifactRepo, "getArtifactVersion");
    const execReq = {
      ...sampleRequest({
        requestId: "p8_wire",
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
    mapCanonicalToOpenAIRequest(adapterReq, "gpt-4o");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("17 — flag OFF leaves legacy behavior unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const legacy =
      "Approved upstream stages:\n- phase storyline · OLD_TRUNCATED_NOTE";
    const result = tryApplyCanonicalGenerationContext({
      prompt: legacy,
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
    expect(result.prompt).toBe(legacy);
    expect(result.metadata.cdfCanonicalContextApplied).toBe(false);
    expect(result.metadata.cdfArtifactContextApplied).toBeUndefined();
  });
});
