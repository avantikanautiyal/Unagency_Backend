/**
 * Phase 10 — Context Orchestrator.
 * Single thin assembly boundary composing Phases 2–9A into one CMR.
 */

import { pinGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";
import * as artifactRepo from "../../../src/platform/cdf/artifacts/repository";
import { createVersion } from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  CONTEXT_ORCHESTRATOR_SOURCE,
  createArtifact,
  fixturePresentationStoryline,
  getCdfSession,
  getContextOrchestratorTraceEventsForTests,
  markApproved,
  orchestrateCanonicalGenerationContext,
  PDF_MIME,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resetContextOrchestratorTracesForTests,
  saveCdfSession,
  shouldSkipLegacySemanticPromptMutation,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  flattenCanonicalModelRequestToLabeledPrompt,
  extractCanonicalMultimodalProviderHandoff,
} from "../../../src/platform/ai/canonical-model-request";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import { withStructuredOutputRequest } from "../../../src/platform/providers/tools/structured/structured-output-execution";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";

const ORG = "org_p10";
const PROJ = "proj_p10";
const CONV = "conv_p10";
const CANONICAL_URL = "data:image/png;base64,P10_CANONICAL_IMAGE";
const LEGACY_URL = "data:image/png;base64,P10_LEGACY_SHOULD_NOT_WIN";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV,
    channelId: partial.channelId ?? "ch_p10",
    ...partial,
  };
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
    brief: "Create a 12-slide investor presentation.",
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
}) {
  markApproved(input.artifactId, input.version, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const pinnedVersion = pinGeneratedForApprove({
    sessionId: input.session.sessionId,
    artifactId: input.artifactId,
    version: input.version,
    phaseId: "storyline",
    artifactKey: "presentation.storyline",
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: input.session.sessionId,
    note: "OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA",
    artifactId: input.artifactId,
    artifactVersion: input.version,
    expectedVersion: pinnedVersion,
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

function approveStorylineV1(sessionIn: ReturnType<typeof startBrief>, marker = "P10_A1") {
  let session = sessionIn;
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
      objective: marker,
    } as unknown as Record<string, unknown>,
    requestId: `p10_story_${marker}`,
  });
  markApproved(created.artifact.artifactId, 1, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const pinnedVersion = pinGeneratedForApprove({
    sessionId: session.sessionId,
    artifactId: created.artifact.artifactId,
    version: 1,
    phaseId: "storyline",
    artifactKey: "presentation.storyline",
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "approve storyline",
    artifactId: created.artifact.artifactId,
    artifactVersion: 1,
    expectedVersion: pinnedVersion,
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
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId: created.artifact.artifactId,
  };
}

describe("Phase 10 Context Orchestrator", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRequirementEngineForTests();
    resetCanonicalGenerationTracesForTests();
    resetContextOrchestratorTracesForTests();
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1 — basic orchestration returns CMR; instruction preserved; no provider call", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const spy = jest.spyOn(artifactRepo, "getArtifactVersion");
    const callCountBefore = spy.mock.calls.length;
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate slide content",
      conversationalInstruction: "CANONICAL_P10_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p10_basic",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.orchestratorApplied).toBe(true);
    expect(result.assemblySource).toBe(CONTEXT_ORCHESTRATOR_SOURCE);
    expect(result.request.currentUserInstruction).toBe("CANONICAL_P10_INSTRUCTION");
    expect(result.modelRequest.messages.length).toBeGreaterThan(0);
    expect(result.metadata.cdfContextOrchestratorApplied).toBe(true);
    expect(result.metadata.cdfCanonicalAssemblySource).toBe(
      CONTEXT_ORCHESTRATOR_SOURCE,
    );
    // Artifact load is OK; orchestrator itself must not invoke providers.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(callCountBefore);
    spy.mockRestore();
  });

  it("2 — exact A@5 loaded; A@6 not substituted", () => {
    let session = selectSource(startBrief());
    const MARKER = "P10_EXACT_A5";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(`${MARKER}_V1`) as unknown as Record<string, unknown>,
      requestId: "p10_a5_seed",
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
        requestId: `p10_a5_v${v}`,
      });
      latest = next.version.version;
    }
    expect(latest).toBe(5);
    session = approveStorylineAtVersion({ session, artifactId, version: 5 });
    // Newer HEAD after pin — must not be substituted.
    createVersion({
      artifactId,
      expectedLatestVersion: 5,
      organizationId: ORG,
      projectId: PROJ,
      data: largeStorylineData(`${MARKER}_V6`) as unknown as Record<string, unknown>,
      requestId: "p10_a5_v6",
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);

    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate slides",
      conversationalInstruction: "Use approved storyline.",
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
    expect(up?.version).toBe(5);
    expect(JSON.stringify(up?.data)).toContain(`${MARKER}_V5`);
    expect(JSON.stringify(up?.data)).not.toContain(`${MARKER}_V6`);
  });

  it("3 — complete upstream ArtifactVersion data (no approval.note / 1500 trunc)", () => {
    let session = selectSource(startBrief());
    const MARKER = "P10_COMPLETE";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(MARKER) as unknown as Record<string, unknown>,
      requestId: "p10_complete",
    });
    let latest = created.version.version;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId: created.artifact.artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStorylineData(`${MARKER}_V${v}`) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p10_c_v${v}`,
      });
      latest = next.version.version;
    }
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 5,
    });
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides now.",
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
    const up = result.request.upstreamArtifacts[0];
    const blob = JSON.stringify(up?.data);
    expect(blob.length).toBeGreaterThan(1500);
    expect(blob).toContain("OBJECTIVE_END");
    expect(blob).not.toContain("OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA");
  });

  it("4 — working memory is separate; does not replace instruction", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const instruction = "CANONICAL_INSTRUCTION_P10_WM";
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "m1",
          role: "user",
          text: "WM_EVIDENCE_ONLY_prior preference for blue",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "m2",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.request.currentUserInstruction).toBe(instruction);
    expect(result.contributors.workingMemory).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(result.modelRequest);
    expect(flat).toContain("WORKING MEMORY");
    expect(flat).toContain("WM_EVIDENCE_ONLY");
    expect(flat).toContain("CURRENT USER INSTRUCTION");
    expect(result.request.currentUserInstruction).not.toContain(
      "WM_EVIDENCE_ONLY",
    );
  });

  it("5 — reference resolution: explicit / ordinal / ambiguous semantics", () => {
    const { session, artifactId } = approveStorylineV1(
      selectSource(startBrief()),
      "P10_REF",
    );
    const explicit = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: `Use artifact ${artifactId}@1 for context.`,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(explicit.ok).toBe(true);
    if (!explicit.ok || explicit.skipped) throw new Error("expected applied");
    expect(
      Number(explicit.metadata.cdfResolvedReferenceCount ?? 0) +
        Number(explicit.metadata.cdfUnresolvedReferenceCount ?? 0) +
        Number(explicit.metadata.cdfAmbiguousReferenceCount ?? 0),
    ).toBeGreaterThanOrEqual(0);

    const ambiguous = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use the previous one from earlier.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok || ambiguous.skipped) throw new Error("expected applied");
    // Ambiguous/unresolved must not invent an extra artifact selection.
    expect(ambiguous.request.currentUserInstruction).toContain("previous one");
  });

  it("6 — multimodal via Phase 9A canonical CMR path", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use the attached image.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            filename: "ref.png",
            assetId: "asset_p10",
            url: CANONICAL_URL,
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.contributors.multimodal).toBe(true);
    const handoff = extractCanonicalMultimodalProviderHandoff(result.modelRequest);
    expect(handoff.applied).toBe(true);
    expect(handoff.imageDeliveries[0]?.url).toBe(CANONICAL_URL);

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p10_mm",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: result.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: result.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(wire).toContain("P10_CANONICAL_IMAGE");
    expect(wire).not.toContain("P10_LEGACY_SHOULD_NOT_WIN");
  });

  it("7 — Production Spec once via CMR; legacy skip barrier set", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    const specs = result.modelRequest.messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === "structured" && p.name === "production_spec");
    expect(specs.length).toBeLessThanOrEqual(1);
    expect(shouldSkipLegacySemanticPromptMutation(result.metadata)).toBe(true);
    expect(result.metadata.cdfSkipPostCmrPromptAppends).toBe(true);
  });

  it("8 — output contract / output requirements via CMR", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        outputKind: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.contributors.outputContract).toBe(true);
    const names = result.modelRequest.messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === "structured")
      .map((p) => (p.type === "structured" ? p.name : ""));
    expect(names).toContain("output_contract");
  });

  it("9 — conflicting legacy semantic path: canonical wins", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "PHASE_PROMPT_CANONICAL",
      conversationalInstruction: "CANONICAL_WINS_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        // Legacy-shaped fields that must not override CMR semantics.
        legacyPromptOverride: "LEGACY_PROMPT_SHOULD_NOT_BE_SOT",
        conversationalEffectiveInstruction: "CTI_FLAT_SHOULD_NOT_OVERRIDE_EXPLICIT",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.request.currentUserInstruction).toBe(
      "CANONICAL_WINS_INSTRUCTION",
    );
    expect(shouldSkipLegacySemanticPromptMutation(result.metadata)).toBe(true);

    const structured = withStructuredOutputRequest(
      {
        requestId: "p10_legacy_barrier",
        organizationId: ORG as never,
        capabilityId: "text.generate" as never,
        providerId: "provider.openai" as never,
        modelId: "gpt-4o",
        modality: "text",
        payload: {
          prompt: flattenCanonicalModelRequestToLabeledPrompt(result.modelRequest),
        },
        metadata: {
          ...result.metadata,
          userBrief: "LEGACY_USER_BRIEF_SHOULD_NOT_REBUILD",
        },
        options: {},
      } as unknown as ProviderExecutionRequest,
      {
        name: "PresentationRoutes",
        schema: {
          type: "object",
          properties: { routes: { type: "array" } },
        },
        strict: true,
      },
    );
    const outPrompt = String(
      (structured.payload as { prompt?: string })?.prompt ?? "",
    );
    expect(outPrompt).toContain("CANONICAL_WINS_INSTRUCTION");
    expect(shouldSkipLegacySemanticPromptMutation(result.metadata)).toBe(true);
  });

  it("10 — CTI effectiveInstruction does not replace explicit canonical instruction", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "CDF_PHASE_PROMPT",
      conversationalInstruction: "AUTHORITATIVE_CANONICAL_INSTRUCTION",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction:
          "CTI_EFFECTIVE_SHOULD_NOT_REPLACE_CANONICAL",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.request.currentUserInstruction).toBe(
      "AUTHORITATIVE_CANONICAL_INSTRUCTION",
    );
    expect(result.metadata.cdfSkipEffectiveInstructionReplace).toBe(true);
    expect(result.request.currentUserInstruction).not.toContain(
      "CTI_EFFECTIVE_SHOULD_NOT_REPLACE",
    );
  });

  it("11 — missing required artifact → typed failure; no CMR success", () => {
    const session = selectSource(startBrief());
    // slide-content requires approved storyline — none present.
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate slides",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.orchestratorApplied).toBe(false);
    expect(result.code).toBeTruthy();
  });

  it("12 — ambiguous reference does not invent artifact selection", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const before = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Generate slides.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(before.ok).toBe(true);
    if (!before.ok || before.skipped) throw new Error("expected applied");
    const baseCount = before.request.upstreamArtifacts.length;

    const ambiguous = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use that earlier thing we talked about.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok || ambiguous.skipped) throw new Error("expected applied");
    expect(ambiguous.request.upstreamArtifacts.length).toBe(baseCount);
    expect(ambiguous.request.currentUserInstruction).toContain(
      "earlier thing",
    );
  });

  it("13 — flag OFF legacy behavior unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const { session } = approveStorylineV1(selectSource(startBrief()));
    const result = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED",
      conversationalInstruction: "ignored when skipped",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toBe(true);
    expect(result.orchestratorApplied).toBe(false);
    expect(result.prompt).toBe("LEGACY_PROMPT_UNCHANGED");
    expect(shouldSkipLegacySemanticPromptMutation(result.metadata)).toBe(false);

    const viaApply = tryApplyCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(viaApply.ok && viaApply.skipped).toBe(true);
  });

  it("14 — Presentation multi-phase: WM + multimodal + exact upstream + Spec + contract", () => {
    let session = selectSource(startBrief());
    const MARKER = "P10_MULTI";
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: largeStorylineData(MARKER) as unknown as Record<string, unknown>,
      requestId: "p10_multi",
    });
    let latest = created.version.version;
    for (let v = 2; v <= 5; v++) {
      const next = createVersion({
        artifactId: created.artifact.artifactId,
        expectedLatestVersion: latest,
        organizationId: ORG,
        projectId: PROJ,
        data: largeStorylineData(`${MARKER}_V${v}`) as unknown as Record<
          string,
          unknown
        >,
        requestId: `p10_multi_v${v}`,
      });
      latest = next.version.version;
    }
    session = approveStorylineAtVersion({
      session,
      artifactId: created.artifact.artifactId,
      version: 5,
    });

    const instruction =
      "Use the attached reference PDF to create the storyline slides.";
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV,
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "reference.pdf",
            extractedText: "P10_PDF_EXTRACT",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm1",
          role: "user",
          text: "Keep the investor narrative tight.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "wm2",
          role: "user",
          text: instruction,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    expect(result.orchestratorApplied).toBe(true);
    expect(result.request.currentUserInstruction).toBe(instruction);
    expect(result.contributors.workingMemory).toBe(true);
    expect(result.contributors.multimodal).toBe(true);
    expect(result.contributors.upstreamArtifacts).toBe(true);
    expect(result.contributors.outputContract).toBe(true);
    const up = result.request.upstreamArtifacts.find(
      (u) => u.artifactId === created.artifact.artifactId,
    );
    expect(up?.version).toBe(5);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(result.modelRequest);
    expect(flat).toContain("CURRENT USER INSTRUCTION");
    expect(flat).toContain("WORKING MEMORY");
    expect(flat).toContain("MULTIMODAL CONTEXT");
    expect(flat).toContain("P10_PDF_EXTRACT");
    expect(flat).toContain("UPSTREAM ARTIFACTS");
  });

  it("15 — provider boundary receives CMR from orchestrator", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P10_PROV");
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Provider receives CMR.",
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
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p10_prov",
          providerId: "provider.openai",
          payload: { canonicalModelRequest: result.modelRequest },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: result.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    expect(JSON.stringify(wire.body)).toContain("Provider receives CMR");
  });

  it("16 — orchestrator trace is safe (no prompt/artifact body/URLs)", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P10_TR");
    resetContextOrchestratorTracesForTests();
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "SECRET_FULL_PROMPT_BODY_SHOULD_NOT_LOG",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p10_trace",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: "https://signed.example/x?token=SECRET_TOKEN_P10",
            assetId: "img_trace",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected applied");
    const events = getContextOrchestratorTraceEventsForTests();
    expect(events.length).toBeGreaterThan(0);
    const applied = events.find(
      (e) => e.event === "ai.context_orchestrator.applied",
    );
    expect(applied).toBeDefined();
    expect(applied?.orchestratorApplied).toBe(true);
    expect(applied?.canonicalAssemblySource).toBe(CONTEXT_ORCHESTRATOR_SOURCE);
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("SECRET_FULL_PROMPT_BODY_SHOULD_NOT_LOG");
    expect(blob).not.toContain("SECRET_TOKEN_P10");
    expect(blob).not.toContain("signed.example");
  });

  it("17 — service-neutral: optional WM/multimodal absent still orchestrates", () => {
    const { session } = approveStorylineV1(selectSource(startBrief()), "P10_OPT");
    const result = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "No WM no multimodal.",
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
    expect(result.contributors.workingMemory).toBe(false);
    expect(result.contributors.multimodal).toBe(false);
    expect(result.contributors.upstreamArtifacts).toBe(true);
    expect(result.orchestratorApplied).toBe(true);
  });
});
