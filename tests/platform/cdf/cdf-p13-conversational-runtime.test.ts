/**
 * Phase 13 — Conversational Runtime Integration.
 * Proves live conversational turns enter Context Orchestrator + Model Runtime
 * with exact ArtifactVersion continuity (ControllableDispatcher only).
 */

import { createVersion } from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  assertInspectionOmitsSensitiveBodies,
  buildConversationalGenerationIntent,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  detectCanonicalSectionsFromModelRequest,
  fixturePackagingDieline,
  fixturePresentationSlideContent,
  fixturePresentationStoryline,
  getCdfSession,
  getConversationalRuntimeTraceEventsForTests,
  inspectConversationalGenerationContext,
  markApproved,
  orchestrateCanonicalGenerationContext,
  PACKAGING_ARTIFACT_KEYS,
  parseRefinementInstruction,
  PDF_MIME,
  PRESENTATION_ARTIFACT_KEYS,
  readConversationalTurnLinkage,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resetConversationalRuntimeTracesForTests,
  resetContextOrchestratorTracesForTests,
  resolveCanonicalConversationalInstruction,
  runConversationalGenerationTurn,
  saveCdfSession,
  shouldSkipLegacySemanticPromptMutation,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import { prepareCanonicalModelRuntime } from "../../../src/platform/ai/model-runtime";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";
import { resolveGenerationReferences } from "../../../src/platform/ai/reference-resolution";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";

const ORG = "org_p13";
const PROJ = "proj_p13";
const CONV_A = "507f1f77bcf86cd7994390a1";
const CONV_B = "507f1f77bcf86cd7994390b2";
const CHANNEL_A = "service:brand_p13:presentations";
const CANONICAL_URL = "data:image/png;base64,P13_CANONICAL_IMAGE";
const LEGACY_URL = "data:image/png;base64,P13_LEGACY_SHOULD_NOT_WIN";

function msg(
  partial: Partial<WorkingMemorySourceMessage> &
    Pick<WorkingMemorySourceMessage, "id" | "role" | "text" | "createdAt">,
): WorkingMemorySourceMessage {
  return {
    conversationId: partial.conversationId ?? CONV_A,
    channelId: partial.channelId ?? CHANNEL_A,
    ...partial,
  };
}

function startBrief(serviceId: "presentation" | "packaging" = "presentation") {
  const started = applyCdfTransition({
    action: "start",
    serviceId,
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  if (!started.ok) throw new Error("start");
  const briefed = applyCdfTransition({
    action: "submit_brief",
    sessionId: started.value.session.sessionId,
    brief:
      serviceId === "presentation"
        ? "Create a presentation about AI adoption."
        : "Redesign packaging for launch.",
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
  const pad = "PAD_".repeat(200);
  return {
    ...base,
    objective: `${marker} ${pad} OBJECTIVE_END`,
    narrativeStrategy: `${marker}_NARRATIVE ${pad}`,
    options: [
      { id: "opt_1", title: `${marker}_OPTION_1`, summary: "Conservative" },
      { id: "opt_2", title: `${marker}_OPTION_2`, summary: "Premium" },
      { id: "opt_3", title: `${marker}_OPTION_3`, summary: "Bold" },
    ],
    notes: `${marker}_NOTES`,
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

function pinStorylineV5(marker = "P13_A") {
  let session = selectSource(startBrief());
  const created = createArtifact({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: "storyline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    artifactType: "structured_doc",
    data: largeStorylineData(`${marker}_V1`) as unknown as Record<string, unknown>,
    requestId: `p13_${marker}_v1`,
  });
  let latest = created.version.version;
  const artifactId = created.artifact.artifactId;
  for (let v = 2; v <= 5; v++) {
    const next = createVersion({
      artifactId,
      expectedLatestVersion: latest,
      organizationId: ORG,
      projectId: PROJ,
      data: largeStorylineData(`${marker}_V${v}`) as unknown as Record<
        string,
        unknown
      >,
      requestId: `p13_${marker}_v${v}`,
    });
    latest = next.version.version;
  }
  // Approve @5 while it is still latest, then create @6 without changing the pin.
  session = approveStorylineAtVersion({
    session,
    artifactId,
    version: 5,
  });
  createVersion({
    artifactId,
    expectedLatestVersion: 5,
    organizationId: ORG,
    projectId: PROJ,
    data: largeStorylineData(`${marker}_V6`) as unknown as Record<string, unknown>,
    requestId: `p13_${marker}_v6`,
  });
  session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
    artifactId,
    version: 5,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId,
    version: 5 as const,
  };
}

function pinSlideContent(session: ReturnType<typeof startBrief>, marker: string) {
  const created = createArtifact({
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
          id: "slide_04",
          order: 3,
          title: `${marker}_SLIDE_4`,
          blocks: [
            {
              id: "b4",
              type: "paragraph",
              content: `${marker}_CONTENT_4`,
              hierarchy: 1,
            },
          ],
        },
      ],
    } as unknown as Record<string, unknown>,
    requestId: `p13_sc_${marker}`,
  });
  let latest = created.version.version;
  for (let v = 2; v <= 5; v++) {
    const ver = createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: latest,
      organizationId: ORG,
      projectId: PROJ,
      data: {
        ...fixturePresentationSlideContent(),
        objective: `${marker}_SC_V${v}`,
        slides: [
          ...fixturePresentationSlideContent().slides,
          {
            id: "slide_04",
            order: 3,
            title: `${marker}_SLIDE_4`,
            blocks: [
              {
                id: "b4",
                type: "paragraph",
                content: `${marker}_CONTENT_4`,
                hierarchy: 1,
              },
            ],
          },
        ],
      } as unknown as Record<string, unknown>,
      requestId: `p13_sc_${marker}_v${v}`,
    });
    latest = ver.version.version;
  }
  markApproved(created.artifact.artifactId, 5, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "slide note",
    artifactId: created.artifact.artifactId,
    artifactVersion: 5,
    expectedVersion: session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  const next = upsertSessionArtifactRef(ap.value.session, {
    artifactId: created.artifact.artifactId,
    version: 5,
    phaseId: "slide-content",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
    role: "approved",
  });
  saveCdfSession(next);
  return {
    session: getCdfSession(next.sessionId)!,
    artifactId: created.artifact.artifactId,
    version: 5,
  };
}

describe("Phase 13 Conversational Runtime Integration", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCanonicalGenerationTracesForTests();
    resetContextOrchestratorTracesForTests();
    resetConversationalRuntimeTracesForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1 — current user instruction preserved", async () => {
    const { session } = pinStorylineV5("T1");
    const instruction = "INSTRUCTION_A_MAKE_PREMIUM";
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: instruction,
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(turn.orchestrationOk).toBe(true);
    expect(turn.apply.ok && !turn.apply.skipped).toBe(true);
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected apply");
    expect(turn.apply.request.currentUserInstruction).toBe(instruction);
  });

  it("2 — conversationId handoff works", () => {
    const intent = buildConversationalGenerationIntent({
      currentUserInstruction: "hi",
      metadata: { conversationId: CONV_A, cdfSessionId: "s", cdfPhaseId: "p" },
    });
    expect(intent.conversationId).toBe(CONV_A);
    expect(intent.conversationIdentityPresent).toBe(true);
    expect(intent.inventedConversation).toBe(false);
  });

  it("3 — channelId handoff works", () => {
    const intent = buildConversationalGenerationIntent({
      currentUserInstruction: "hi",
      metadata: {
        conversationId: CONV_A,
        channelId: CHANNEL_A,
        cdfSessionId: "s",
        cdfPhaseId: "p",
      },
    });
    expect(intent.channelId).toBe(CHANNEL_A);
    expect(intent.conversationIdentityPresent).toBe(true);
  });

  it("4 — conversationId-only handoff works", async () => {
    const { session } = pinStorylineV5("T4");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Also tighten the CTA.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        // no channelId
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "m1",
          role: "user",
          text: "Create a presentation about AI adoption.",
          createdAt: "2026-01-01T00:00:00.000Z",
          channelId: undefined,
        }),
      ],
    });
    expect(turn.intent.channelId).toBeUndefined();
    expect(turn.intent.conversationId).toBe(CONV_A);
    expect(turn.inspection.conversationIdPresent).toBe(true);
    expect(turn.orchestratorApplied).toBe(true);
  });

  it("5 — missing conversation identity does not invent linkage", () => {
    const intent = buildConversationalGenerationIntent({
      currentUserInstruction: "x",
      metadata: { cdfSessionId: "s", cdfPhaseId: "slide-content" },
    });
    expect(intent.conversationId).toBeUndefined();
    expect(intent.channelId).toBeUndefined();
    expect(intent.conversationIdentityPresent).toBe(false);
    expect(intent.inventedConversation).toBe(false);
  });

  it("6 — working memory comes from correct conversation", async () => {
    const { session } = pinStorylineV5("T6");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Make it more premium.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "a1",
          role: "user",
          text: "TURN_A_CREATE_AI_ADOPTION",
          createdAt: "2026-01-01T00:00:00.000Z",
          conversationId: CONV_A,
        }),
        msg({
          id: "b1",
          role: "user",
          text: "TURN_B_SHOULD_NOT_APPEAR",
          createdAt: "2026-01-01T00:00:30.000Z",
          conversationId: CONV_B,
        }),
      ],
    });
    expect(turn.apply.ok && !turn.apply.skipped).toBe(true);
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      turn.apply.modelRequest,
    );
    expect(flat).toContain("TURN_A_CREATE_AI_ADOPTION");
    expect(flat).not.toContain("TURN_B_SHOULD_NOT_APPEAR");
  });

  it("7 — conversation isolation", async () => {
    const { session } = pinStorylineV5("T7");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Continue in A.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        channelId: CHANNEL_A,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "iso_a",
          role: "user",
          text: "ISO_CONV_A_ONLY",
          createdAt: "2026-01-01T00:00:00.000Z",
          conversationId: CONV_A,
        }),
        msg({
          id: "iso_b",
          role: "user",
          text: "ISO_CONV_B_LEAK",
          createdAt: "2026-01-01T00:00:01.000Z",
          conversationId: CONV_B,
          channelId: "other_channel",
        }),
      ],
    });
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      turn.apply.modelRequest,
    );
    expect(flat).toContain("ISO_CONV_A_ONLY");
    expect(flat).not.toContain("ISO_CONV_B_LEAK");
  });

  it("8 — exact previous ArtifactVersion reaches downstream CMR", async () => {
    const pinned = pinStorylineV5("T8");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Use the second option and make it more premium.",
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        apiExecutionId: "exec_p13_t8",
      },
      organizationId: ORG,
      projectId: PROJ,
      producedArtifactId: pinned.artifactId,
      producedArtifactVersion: 5,
    });
    expect(turn.inspection.upstreamArtifactVersions).toContain(
      `${pinned.artifactId}@5`,
    );
    expect(turn.linkage.upstreamArtifactVersions).toContain(
      `${pinned.artifactId}@5`,
    );
  });

  it("9 — A@5 is used even when A@6/latest exists", async () => {
    const pinned = pinStorylineV5("T9");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Build slides from approved storyline.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    const up = turn.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === pinned.artifactId,
    );
    expect(up?.version).toBe(5);
    expect(up?.version).not.toBe(6);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      turn.apply.modelRequest,
    );
    expect(flat).toContain("T9_V5");
    expect(flat).not.toContain("T9_V6");
  });

  it("10 — reference option 2 resolves deterministically", async () => {
    const pinned = pinStorylineV5("T10");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Use option 2 and make it more premium.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    const refs = turn.apply.request.referenceResolution?.references ?? [];
    const opt = refs.find((r) => r.referenceType === "option");
    expect(opt?.status).toBe("exact");
    expect(opt?.optionIndex).toBe(2);
    expect(opt?.artifactId).toBe(pinned.artifactId);
    expect(opt?.version).toBe(5);
  });

  it("11 — ambiguous reference does not invent", () => {
    const result = resolveGenerationReferences({
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
    const amb = result.references.find((r) => r.status === "ambiguous");
    expect(amb).toBeDefined();
    expect(amb?.artifactId).toBeUndefined();
    expect(result.originalUserInstruction).toBe("Use the approved design.");
  });

  it("12 — unresolved reference is preserved", async () => {
    const { session } = pinStorylineV5("T12");
    const instruction = "Use the previous output that does not exist xyzzy.";
    // Force previous_output with no generated role — may still resolve approved.
    // Use a phrase that stays unresolved:
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use version 99.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected");
    expect(applied.request.currentUserInstruction).toBe("Use version 99.");
    const ver = applied.request.referenceResolution?.references.find(
      (r) => r.referenceType === "artifact_version",
    );
    expect(ver?.status).toBe("unresolved");
    expect(applied.request.referenceResolution?.originalUserInstruction).toBe(
      "Use version 99.",
    );
    void instruction;
  });

  it("13 — CTI effectiveInstruction cannot override canonical instruction", async () => {
    const { session } = pinStorylineV5("T13");
    expect(
      resolveCanonicalConversationalInstruction({
        refinePrompt: "INSTRUCTION_A",
        conversationalEffectiveInstruction: "INSTRUCTION_C",
      }),
    ).toBe("INSTRUCTION_A");

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "PHASE_PROMPT",
      conversationalInstruction: "INSTRUCTION_A",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: "INSTRUCTION_C",
        refinePrompt: "INSTRUCTION_A",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.request.currentUserInstruction).toBe("INSTRUCTION_A");
    expect(orch.request.currentUserInstruction).not.toBe("INSTRUCTION_C");
    expect(shouldSkipLegacySemanticPromptMutation(orch.metadata)).toBe(true);
  });

  it("14 — canonical multimodal attachment is preserved", async () => {
    const { session } = pinStorylineV5("T14");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use this PDF as a reference.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "brief.pdf",
            extractedText: "P13_PDF_EXTRACT_TEXT",
            assetId: "att_pdf_p13",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.contributors.multimodal).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(orch.modelRequest);
    expect(flat).toContain("P13_PDF_EXTRACT_TEXT");
    expect(flat).toContain("MULTIMODAL CONTEXT");
  });

  it("15 — legacy conflicting multimodal asset cannot override canonical", async () => {
    const { session } = pinStorylineV5("T15");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use attached image.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: CANONICAL_URL,
            assetId: "img_canonical_a",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    const prepared = prepareCanonicalModelRuntime({
      modelRequest: orch.modelRequest,
      providerId: "provider.openai",
      modelId: "gpt-4o",
      metadata: {
        ...orch.metadata,
        assets: [
          {
            mimeType: "image/png",
            url: LEGACY_URL,
            assetId: "img_legacy_b",
          },
        ],
      },
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("runtime");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p13_mm_conflict",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: orch.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(wire).toContain("P13_CANONICAL_IMAGE");
    expect(wire).not.toContain("P13_LEGACY_SHOULD_NOT_WIN");
  });

  it("16 — Production Spec is preserved", async () => {
    const { session } = pinStorylineV5("T16");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Continue.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.contributors.productionSpec).toBe(true);
    const sections = detectCanonicalSectionsFromModelRequest(orch.modelRequest);
    expect(sections.productionSpec).toBe(true);
  });

  it("17 — output contract is preserved", async () => {
    const { session } = pinStorylineV5("T17");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Continue.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.contributors.outputContract).toBe(true);
  });

  it("18 — required artifact failure prevents provider", async () => {
    const session = selectSource(startBrief());
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Generate slides without storyline.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p13_missing",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(turn.orchestrationOk).toBe(false);
    expect(turn.providerInvoked).toBe(false);
    expect(turn.applyCode).toBeTruthy();
  });

  it("19 — attachment authorization is preserved (no invented attachments)", async () => {
    const { session } = pinStorylineV5("T19");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Use attachment.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        // No multimodalAttachments — must not invent from unrelated keys
        s3KeyGuess: "s3://bucket/secret.pdf",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.contributors.multimodal).toBe(false);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(orch.modelRequest);
    expect(flat).not.toContain("s3://bucket/secret.pdf");
  });

  it("20 — turn → execution → artifact linkage is preserved", async () => {
    const pinned = pinStorylineV5("T20");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Create slides.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        channelId: CHANNEL_A,
        apiExecutionId: "exec_p13_link",
      },
      organizationId: ORG,
      projectId: PROJ,
      producedArtifactId: "cdfart_downstream_sc",
      producedArtifactVersion: 1,
    });
    const linkage = readConversationalTurnLinkage(turn.stampedMetadata);
    expect(linkage).not.toBeNull();
    expect(linkage?.conversationId).toBe(CONV_A);
    expect(linkage?.executionId).toBe("exec_p13_link");
    expect(linkage?.cdfSessionId).toBe(pinned.session.sessionId);
    expect(linkage?.cdfPhaseId).toBe("slide-content");
    expect(linkage?.artifactId).toBe("cdfart_downstream_sc");
    expect(linkage?.upstreamArtifactVersions).toContain(
      `${pinned.artifactId}@5`,
    );
  });

  it("21 — two-turn storyline → follow-up flow (UNIT FIXTURE; see Phase 13A for real E2E)", async () => {
    const turn1Instruction = "Create a presentation about AI adoption.";
    const turn2Instruction =
      "Use the second option and make it more premium.";

    // UNIT FIXTURE: pinStorylineV5 establishes exact storyline@5 for isolated
    // continuity assertions. PRIMARY real gen→persist→approve→Turn2 proof is
    // cdf-p13a-real-conversational-continuity.test.ts (no manual re-pin).
    const pinned = pinStorylineV5("T21");

    // Turn 1: assemble CMR for the create turn (orchestrator-only fixture path).
    const turn1Orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate storyline",
      conversationalInstruction: turn1Instruction,
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        apiExecutionId: "exec_p13_t21_1",
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "t21_u1",
          role: "user",
          text: turn1Instruction,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(turn1Orch.ok && !turn1Orch.skipped).toBe(true);
    if (!turn1Orch.ok || turn1Orch.skipped) throw new Error("turn1 orch");
    expect(turn1Orch.request.currentUserInstruction).toBe(turn1Instruction);
    expect(
      turn1Orch.request.upstreamArtifacts.some(
        (u) => u.artifactId === pinned.artifactId && u.version === 5,
      ),
    ).toBe(true);

    // Turn 2: full conversational harness through orchestrator + Model Runtime.
    const turn2 = await runConversationalGenerationTurn({
      currentUserInstruction: turn2Instruction,
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        apiExecutionId: "exec_p13_t21_2",
        conversationalEffectiveInstruction: "INSTRUCTION_C_SHOULD_LOSE",
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "t21_u1",
          role: "user",
          text: turn1Instruction,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "t21_a1",
          role: "assistant",
          text: "Storyline options ready.",
          createdAt: "2026-01-01T00:00:30.000Z",
        }),
        msg({
          id: "t21_u2",
          role: "user",
          text: turn2Instruction,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
      producedArtifactId: pinned.artifactId,
      producedArtifactVersion: 5,
    });

    expect(turn2.orchestrationOk).toBe(true);
    if (!turn2.apply.ok || turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    expect(turn2.apply.request.currentUserInstruction).toBe(turn2Instruction);
    expect(turn2.inspection.workingMemoryTurnCount).toBeGreaterThan(0);
    const refs = turn2.apply.request.referenceResolution?.references ?? [];
    expect(refs.some((r) => r.optionIndex === 2 && r.status === "exact")).toBe(
      true,
    );
    const up = turn2.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === pinned.artifactId,
    );
    expect(up?.version).toBe(5);
    expect(
      turn2.apply.metadata.cdfCanonicalProductionSpecPresent === true ||
        turn2.inspection.productionSpecPresent,
    ).toBe(true);
    expect(turn2.providerInvoked).toBe(true);
    expect(turn2.modelRequestPresent).toBe(true);
    const prepared = prepareCanonicalModelRuntime({
      modelRequest: turn2.apply.modelRequest,
      metadata: turn2.apply.metadata,
      providerId: "provider.openai",
      modelId: "gpt-4o",
    });
    expect(prepared.ok).toBe(true);
  });

  it("22 — three-turn presentation refinement flow", async () => {
    const pinned = pinStorylineV5("T22");
    const sc = pinSlideContent(pinned.session, "T22");
    // Re-pin storyline after slide-content approval so both exact versions remain.
    let session = upsertSessionArtifactRef(sc.session, {
      artifactId: pinned.artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: sc.artifactId,
      version: 5,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const turn3Instruction = "Make slide 4 more visual.";
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: turn3Instruction,
      prompt: "Generate design routes",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "design-routes",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        selectedSlideNumber: 3,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "t22_1",
          role: "user",
          text: "Create a presentation about AI.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        msg({
          id: "t22_2",
          role: "user",
          text: "Use option 2.",
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        msg({
          id: "t22_3",
          role: "user",
          text: turn3Instruction,
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });
    expect(turn.orchestrationOk).toBe(true);
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    expect(turn.apply.request.currentUserInstruction).toBe(turn3Instruction);
    const slideRef = turn.apply.request.referenceResolution?.references.find(
      (r) => r.referenceType === "slide",
    );
    expect(slideRef?.slideNumber).toBe(4);
    // design-routes inherits slide-content (not storyline) — exact SC@5 must be present.
    const scUp = turn.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === sc.artifactId,
    );
    expect(scUp?.version).toBe(5);
    expect(
      turn.apply.request.upstreamArtifacts.some((u) => u.version === 5),
    ).toBe(true);
    expect(turn.inspection.workingMemoryTurnCount).toBeGreaterThan(0);
  });

  it("23 — multimodal conversation flow", async () => {
    const pinned = pinStorylineV5("T23");
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Use this PDF as a reference.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        multimodalAttachments: [
          {
            mimeType: PDF_MIME,
            filename: "ref.pdf",
            extractedText: "P13_MULTIMODAL_PDF_BODY",
            assetId: "pdf_auth_conv",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(turn.orchestratorApplied).toBe(true);
    expect(turn.inspection.multimodalDocumentCount).toBeGreaterThan(0);
    if (!turn.apply.ok || turn.apply.skipped) throw new Error("expected");
    const prepared = prepareCanonicalModelRuntime({
      modelRequest: turn.apply.modelRequest,
      metadata: turn.apply.metadata,
      providerId: "provider.openai",
      modelId: "gpt-4o",
    });
    expect(prepared.ok).toBe(true);
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p13_mm",
          providerId: "provider.openai",
          payload: { canonicalModelRequest: turn.apply.modelRequest },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: turn.apply.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    expect(JSON.stringify(wire.body)).toContain("P13_MULTIMODAL_PDF_BODY");
  });

  it("24 — conflicting context flow: canonical A wins", async () => {
    const pinned = pinStorylineV5("T24");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PHASE_PROMPT_B",
      conversationalInstruction: "INSTRUCTION_A",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationalEffectiveInstruction: "INSTRUCTION_C",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: CANONICAL_URL,
            assetId: "IMAGE_A",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "wm_b",
          role: "user",
          text: "INSTRUCTION_B",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    expect(orch.request.currentUserInstruction).toBe("INSTRUCTION_A");
    const up = orch.request.upstreamArtifacts.find(
      (u) => u.artifactId === pinned.artifactId,
    );
    expect(up?.version).toBe(5);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(orch.modelRequest);
    expect(flat).toContain("INSTRUCTION_A");
    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p13_conflict",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: orch.modelRequest,
            assets: [{ url: LEGACY_URL, mimeType: "image/png" }],
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: orch.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = JSON.stringify(mapCanonicalToOpenAIRequest(adapter, "gpt-4o").body);
    expect(wire).toContain("P13_CANONICAL_IMAGE");
    expect(wire).not.toContain("P13_LEGACY_SHOULD_NOT_WIN");
  });

  it("25 — live canonical CDF path exercises orchestrator + runtime", async () => {
    const pinned = pinStorylineV5("T25");
    resetConversationalRuntimeTracesForTests();
    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: "Live path check.",
      prompt: "Generate",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        apiExecutionId: "exec_p13_live",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(turn.orchestratorApplied).toBe(true);
    expect(turn.providerInvoked).toBe(true);
    expect(turn.stampedMetadata.cdfContextOrchestratorApplied).toBe(true);
    expect(turn.stampedMetadata.modelRuntimeApplied).toBe(true);
    const events = getConversationalRuntimeTraceEventsForTests();
    expect(
      events.some((e) => e.name === "ai.conversation_generation.intent"),
    ).toBe(true);
    expect(
      events.some((e) => e.name === "ai.conversation_generation.context"),
    ).toBe(true);
    expect(
      events.some((e) => e.name === "ai.conversation_generation.completed"),
    ).toBe(true);
  });

  it("26 — safe context inspection contains metadata but no sensitive bodies", async () => {
    const pinned = pinStorylineV5("T26");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "SECRET_FULL_USER_PROMPT_BODY",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        apiExecutionId: "exec_p13_inspect",
        multimodalAttachments: [
          {
            mimeType: "image/png",
            url: "https://signed.example/x?token=SECRET_TOKEN_P13",
            assetId: "img_secret",
          },
        ],
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("expected");
    const inspection = inspectConversationalGenerationContext({
      orchestration: orch,
      providerId: "provider.openai",
      representationStrategy: "flatten_labeled_prompt",
    });
    assertInspectionOmitsSensitiveBodies(inspection);
    expect(inspection.inspected).toBe(true);
    expect(inspection.currentInstructionPresent).toBe(true);
    expect(inspection.currentInstructionLength).toBeGreaterThan(0);
    expect(inspection.generationContextHash).toBeTruthy();
    expect(inspection.conversationIdPresent).toBe(true);
    expect(inspection.executionId).toBe("exec_p13_inspect");
    const blob = JSON.stringify(inspection);
    expect(blob).not.toContain("SECRET_FULL_USER_PROMPT_BODY");
    expect(blob).not.toContain("SECRET_TOKEN_P13");
    expect(blob).not.toContain("signed.example");
  });

  it("27 — Presentation multi-phase regression (model + deterministic)", async () => {
    const pinned = pinStorylineV5("T27");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate slide-content",
      conversationalInstruction: "Continue slide-content.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("slide-content");
    expect(orch.request.currentUserInstruction).toContain("slide-content");
    expect(orch.contributors.upstreamArtifacts).toBe(true);
    expect(orch.contributors.cdfPhase).toBe(true);

    const sc = pinSlideContent(pinned.session, "T27");
    let session = upsertSessionArtifactRef(sc.session, {
      artifactId: pinned.artifactId,
      version: 5,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: sc.artifactId,
      version: 5,
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      role: "approved",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const orch2 = orchestrateCanonicalGenerationContext({
      prompt: "Generate design-routes",
      conversationalInstruction: "Continue design-routes.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "design-routes",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch2.ok && !orch2.skipped).toBe(true);
    if (!orch2.ok || orch2.skipped) throw new Error("design-routes");
    expect(orch2.request.currentUserInstruction).toContain("design-routes");
    expect(orch2.contributors.upstreamArtifacts).toBe(true);

    // Deterministic M6 refinement must not be forced through model runtime
    const parsed = parseRefinementInstruction(
      `Change the title on slide 4 to "Visual Impact"`,
    );
    expect(parsed.op).toBe("SET_TEXT");
    expect(parsed.slideNumber).toBe(4);
    expect(parsed.ambiguous).toBe(false);
  });

  it("28 — non-Presentation service-neutral regression (packaging)", async () => {
    const session = startBrief("packaging");
    const intent = buildConversationalGenerationIntent({
      currentUserInstruction: "Generate packaging routes.",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "routes",
        cdfServiceId: "packaging",
        conversationId: CONV_A,
        channelId: CHANNEL_A,
      },
      organizationId: ORG,
    });
    expect(intent.cdfServiceId).toBe("packaging");
    expect(intent.conversationId).toBe(CONV_A);
    expect(intent.inventedConversation).toBe(false);

    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "structured_doc",
      data: fixturePackagingDieline() as unknown as Record<string, unknown>,
      requestId: "p13_pack_dieline",
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: ORG,
      projectId: PROJ,
    });
    let next = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      role: "approved",
    });
    saveCdfSession(next);
    next = getCdfSession(next.sessionId)!;

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "Generate packaging routes",
      conversationalInstruction: "Generate three shelf-winning routes.",
      metadata: {
        cdfSessionId: next.sessionId,
        cdfPhaseId: "routes",
        cdfServiceId: "packaging",
        service: "Packaging",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "pack1",
          role: "user",
          text: "Redesign packaging for launch.",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    // Packaging may apply or fail typed — must not invent conversation/artifacts.
    if (orch.ok && !orch.skipped) {
      expect(orch.request.currentUserInstruction).toBe(
        "Generate three shelf-winning routes.",
      );
      expect(orch.metadata.conversationalInventedConversation).toBe(false);
      expect(orch.assemblySource).toBe("context_orchestrator");
    } else if (!orch.ok) {
      expect(orch.code).toBeTruthy();
      expect(orch.orchestratorApplied).toBe(false);
    } else {
      expect(orch.orchestratorApplied).toBe(false);
    }
  });

  it("29 — flag OFF behavior unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED",
      conversationalInstruction: "Should not assemble CMR",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && orch.skipped).toBe(true);
    if (!orch.ok || !orch.skipped) throw new Error("expected skip");
    expect(orch.prompt).toBe("LEGACY_PROMPT_UNCHANGED");
    expect(orch.orchestratorApplied).toBe(false);
  });
});
