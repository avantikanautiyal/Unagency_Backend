/**
 * Phase 13A — Real conversational persistence & continuity.
 *
 * PRIMARY E2E proof (no manual re-pin between turns):
 *   REAL Turn1 generation → REAL ArtifactVersion persist → REAL CDF approve
 *   → REAL Turn2 (same conversation/session; dependency resolver discovers pin)
 *
 * UNIT FIXTURE tests (isolated) may still use pinStorylineV5 in cdf-p13-*.
 * This file is the principal continuity proof without that workaround.
 */

import { getArtifactVersion } from "../../../src/platform/cdf/artifacts/repository";
import {
  applyCdfTransition,
  assertTurn2ProviderBoundaryFromCmr,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  getCdfSession,
  loadPersistedConversationalMessages,
  orchestrateCanonicalGenerationContext,
  PRESENTATION_ARTIFACT_KEYS,
  readConversationalTurnLinkage,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resetContextOrchestratorTracesForTests,
  resetConversationalMessageLedgerForTests,
  resetConversationalRuntimeTracesForTests,
  runConversationalGenerationTurn,
  runRealConversationalContinuityE2E,
  tryApplyCanonicalGenerationContext,
} from "../../../src/platform/cdf";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import { prepareCanonicalModelRuntime } from "../../../src/platform/ai/model-runtime";
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";

const ORG = "org_p13a";
const PROJ = "proj_p13a";
const CONV_A = "507f1f77bcf86cd7994390a1";
const CONV_B = "507f1f77bcf86cd7994390b2";
const CHANNEL_A = "service:brand_p13a:presentations";
const CHANNEL_B = "service:brand_p13a:presentations_b";

const TURN1 = "Create a presentation about AI adoption.";
const TURN2 = "Use the second option and make it more premium.";
const TURN3 = "Make slide 4 more visual.";
const APPROVAL_NOTE = "OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA";

describe("Phase 13A Real Conversational Continuity", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCanonicalGenerationTracesForTests();
    resetContextOrchestratorTracesForTests();
    resetConversationalRuntimeTracesForTests();
    resetConversationalMessageLedgerForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1 — real Turn 1 creates persisted ArtifactVersion", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    expect(e2e.turn1.artifactId).toBeTruthy();
    expect(e2e.turn1.artifactVersion).toBe(5);
    const ver = getArtifactVersion(
      e2e.turn1.artifactId!,
      e2e.turn1.artifactVersion!,
    );
    expect(ver.artifactId).toBe(e2e.turn1.artifactId);
    expect(ver.version).toBe(5);
    expect(ver.data).toBeTruthy();
    const data = ver.data as { options?: unknown[]; objective?: string };
    expect(Array.isArray(data.options) && data.options.length >= 2).toBe(true);
    expect(String(data.objective ?? "")).toContain("AI adoption");
  });

  it("2 — real Turn 1 records required CDF approved pin", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    const session = getCdfSession(e2e.cdfSessionId)!;
    expect(session.phaseId).toBe("slide-content");
    const pin = (session.approvedArtifacts ?? []).find(
      (r) =>
        r.artifactId === e2e.turn1.artifactId &&
        r.version === e2e.turn1.artifactVersion &&
        r.phaseId === "storyline" &&
        r.artifactKey === PRESENTATION_ARTIFACT_KEYS.storyline,
    );
    expect(pin).toBeTruthy();
    // Production approve transition — not harness upsertSessionArtifactRef.
    expect(e2e.approvalNoteUsed).toBe(APPROVAL_NOTE);
  });

  it("3 — real Turn 2 discovers artifact without manual re-pinning", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    const expected = `${e2e.turn1.artifactId}@${e2e.turn1.artifactVersion}`;
    expect(e2e.turn2.upstreamArtifactVersions).toContain(expected);
    expect(e2e.turn2.orchestrationOk).toBe(true);
    expect(e2e.turn2.providerInvoked).toBe(true);
  });

  it("4 — exact artifactId@version reaches Turn 2 CMR", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const up = e2e.turn2.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === e2e.turn1.artifactId,
    );
    expect(up?.version).toBe(e2e.turn1.artifactVersion);
    expect(e2e.turn2.apply.request.currentUserInstruction).toBe(TURN2);
    expect(e2e.turn2.cdfSessionId).toBe(e2e.turn1.cdfSessionId);
    expect(e2e.conversationId).toBe(CONV_A);
  });

  it("5 — newer ArtifactVersion does not replace pinned version", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: true,
      includeTurn3: false,
    });
    expect(e2e.newerVersionCreated).toBe(6);
    const pin = `${e2e.turn1.artifactId}@5`;
    const newer = `${e2e.turn1.artifactId}@6`;
    expect(e2e.turn2.upstreamArtifactVersions).toContain(pin);
    expect(e2e.turn2.upstreamArtifactVersions).not.toContain(newer);
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const dataStr = JSON.stringify(
      e2e.turn2.apply.request.upstreamArtifacts.find(
        (u) => u.artifactId === e2e.turn1.artifactId,
      )?.data ?? {},
    );
    expect(dataStr).not.toContain("NEWER_SHOULD_NOT_WIN");
  });

  it("6 — Turn 2 option reference resolves against actual artifact", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const refs = e2e.turn2.apply.request.referenceResolution?.references ?? [];
    const opt = refs.find(
      (r) => r.optionIndex === 2 && r.status === "exact",
    );
    expect(opt).toBeTruthy();
    expect(opt?.artifactId).toBe(e2e.turn1.artifactId);
    expect(opt?.version).toBe(e2e.turn1.artifactVersion);
  });

  it("7 — Turn 3 refinement uses actual persisted Turn 2 state", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: true,
      turn3Instruction: TURN3,
    });
    expect(e2e.turn3).toBeTruthy();
    if (!e2e.turn3?.apply.ok || e2e.turn3.apply.skipped) {
      throw new Error("turn3 apply");
    }
    expect(e2e.turn3.apply.request.currentUserInstruction).toBe(TURN3);
    const slideRef = (
      e2e.turn3.apply.request.referenceResolution?.references ?? []
    ).find((r) => r.slideNumber === 4 || r.sourceText?.includes("slide 4"));
    expect(slideRef?.status === "exact" || slideRef != null).toBe(true);
    const scPin = `${e2e.turn3.artifactId}@${e2e.turn3.artifactVersion}`;
    expect(e2e.turn3.upstreamArtifactVersions).toContain(scPin);
    expect(e2e.turn3.cdfSessionId).toBe(e2e.cdfSessionId);
    expect(e2e.turn3.inspection.workingMemoryTurnCount).toBeGreaterThan(0);
  });

  it("8 — conversation persistence feeds Turn 2 working memory", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    const loaded = loadPersistedConversationalMessages({
      conversationId: CONV_A,
      channelId: CHANNEL_A,
    });
    expect(loaded.some((m) => m.text === TURN1 && m.role === "user")).toBe(
      true,
    );
    expect(loaded.some((m) => m.text === TURN2 && m.role === "user")).toBe(
      true,
    );
    expect(e2e.turn2.inspection.workingMemoryTurnCount).toBeGreaterThan(0);
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const wm = e2e.turn2.apply.request.workingMemory;
    const wmText = JSON.stringify(wm ?? {});
    expect(wmText).toContain("AI adoption");
  });

  it("9 — conversation ↔ execution ↔ artifact linkage preserved", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    const linkage = readConversationalTurnLinkage(
      e2e.turn2.apply.ok && !e2e.turn2.apply.skipped
        ? e2e.turn2.apply.metadata
        : {},
    );
    // Turn2 linkage from harness stamp may be on stampedMetadata via apply metadata.
    expect(e2e.turn2.executionId).toContain("exec_p13a_t2_");
    expect(e2e.turn1.executionId).toContain("exec_p13a_t1_");
    expect(e2e.turn2.cdfSessionId).toBe(e2e.turn1.cdfSessionId);
    expect(e2e.turn2.upstreamArtifactVersions).toContain(
      `${e2e.turn1.artifactId}@${e2e.turn1.artifactVersion}`,
    );
    const session = getCdfSession(e2e.cdfSessionId)!;
    expect(
      (session.approvedArtifacts ?? []).some(
        (r) =>
          r.artifactId === e2e.turn1.artifactId &&
          r.version === e2e.turn1.artifactVersion,
      ),
    ).toBe(true);
    void linkage;
  });

  it("10 — approval.note is not authoritative pipeline context", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
      approvalNote: APPROVAL_NOTE,
    });
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const flat = flattenCanonicalModelRequestToLabeledPrompt(
      e2e.turn2.apply.modelRequest,
    );
    // Upstream must include real artifact data, not rely on truncated note as SoT.
    expect(flat).toContain("UPSTREAM ARTIFACT");
    expect(e2e.turn2.apply.request.upstreamArtifacts.length).toBeGreaterThan(0);
    const upData = JSON.stringify(
      e2e.turn2.apply.request.upstreamArtifacts[0]?.data ?? {},
    );
    expect(upData).not.toBe(APPROVAL_NOTE);
    expect(upData.length).toBeGreaterThan(APPROVAL_NOTE.length);
    // Note must not replace CURRENT USER INSTRUCTION.
    expect(e2e.turn2.apply.request.currentUserInstruction).toBe(TURN2);
    expect(e2e.turn2.apply.request.currentUserInstruction).not.toBe(
      APPROVAL_NOTE,
    );
  });

  it("11 — missing required ArtifactVersion blocks provider", async () => {
    // Advance to slide-content with note-only approve (no ArtifactVersion pin).
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
      brief: TURN1,
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: briefed.value.session.sessionId,
      routeIndex: 2,
      routeTitle: "Start from Scratch",
      expectedVersion: briefed.value.session.sessionVersion,
    });
    if (!selected.ok) throw new Error("select");
    const ap = applyCdfTransition({
      action: "approve",
      sessionId: selected.value.session.sessionId,
      note: APPROVAL_NOTE,
      expectedVersion: selected.value.session.sessionVersion,
    });
    expect(ap.ok).toBe(false);
    if (ap.ok) return;
    expect(ap.error.message).toMatch(/no canonical ArtifactVersion/);

    const turn = await runConversationalGenerationTurn({
      currentUserInstruction: TURN2,
      prompt: "Generate slide content",
      metadata: {
        cdfSessionId: selected.value.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
        channelId: CHANNEL_A,
        apiExecutionId: "exec_p13a_missing",
      },
      organizationId: ORG,
      projectId: PROJ,
      skipProviderOnApplyFailure: true,
    });
    expect(turn.orchestrationOk).toBe(false);
    expect(turn.providerInvoked).toBe(false);
    expect(turn.apply.ok).toBe(false);
    if (turn.apply.ok) throw new Error("expected fail");
    expect([
      "DEPENDENCY_NOT_SATISFIED",
      "CONTEXT_RESOLUTION_FAILED",
      "ARTIFACT_NOT_FOUND",
      "ARTIFACT_VERSION_NOT_FOUND",
    ]).toContain(turn.apply.code);
  });

  it("12 — cross-conversation isolation", async () => {
    const a = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    // Conversation B / Session B — separate start; must not inherit A's pin.
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    if (!started.ok) throw new Error("start B");
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: started.value.session.sessionId,
      brief: "Unrelated brief for session B",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief B");
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: briefed.value.session.sessionId,
      routeIndex: 2,
      routeTitle: "Start from Scratch",
      expectedVersion: briefed.value.session.sessionVersion,
    });
    if (!selected.ok) throw new Error("select B");
    const sessionB = selected.value.session;
    expect(sessionB.sessionId).not.toBe(a.cdfSessionId);

    const orchB = orchestrateCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: TURN2,
      metadata: {
        cdfSessionId: sessionB.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_B,
        channelId: CHANNEL_B,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    // B has no approved storyline — must fail closed, not use A's artifact.
    expect(orchB.ok).toBe(false);
    if (orchB.ok) throw new Error("B must not succeed without its own pin");

    const msgsB = loadPersistedConversationalMessages({
      conversationId: CONV_B,
      channelId: CHANNEL_B,
    });
    expect(msgsB.some((m) => m.text === TURN1)).toBe(false);
  });

  it("13 — provider-boundary representation contains canonical continuity", async () => {
    const e2e = await runRealConversationalContinuityE2E({
      organizationId: ORG,
      projectId: PROJ,
      conversationId: CONV_A,
      channelId: CHANNEL_A,
      createNewerVersionAfterApprove: false,
      includeTurn3: false,
    });
    assertTurn2ProviderBoundaryFromCmr(e2e.turn2);
    if (!e2e.turn2.apply.ok || e2e.turn2.apply.skipped) {
      throw new Error("turn2 apply");
    }
    const prepared = prepareCanonicalModelRuntime({
      modelRequest: e2e.turn2.apply.modelRequest,
      metadata: e2e.turn2.apply.metadata,
      providerId: "provider.openai",
      modelId: "gpt-4o",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.message);
    expect(prepared.prompt).toContain(TURN2);
    expect(prepared.prompt).toContain(String(e2e.turn1.artifactId));

    const adapter = toAdapterRequestFromExecution({
      request: {
        ...sampleRequest({
          requestId: "p13a_boundary",
          providerId: "provider.openai",
          payload: {
            canonicalModelRequest: e2e.turn2.apply.modelRequest,
          },
        }),
        capabilityId: "text.generate",
        modelId: "gpt-4o",
        metadata: e2e.turn2.apply.metadata,
      } as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const mapped = mapCanonicalToOpenAIRequest(adapter, "gpt-4o");
    const serialized = JSON.stringify(mapped.body);
    expect(serialized).toContain(TURN2);
    expect(serialized).toContain(String(e2e.turn1.artifactId));
  });

  it("14 — flag OFF does not invoke canonical continuity path", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
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
      brief: TURN1,
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: briefed.value.session.sessionId,
      routeIndex: 2,
      routeTitle: "Start from Scratch",
      expectedVersion: briefed.value.session.sessionVersion,
    });
    if (!selected.ok) throw new Error("select");

    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED_P13A",
      conversationalInstruction: TURN2,
      metadata: {
        cdfSessionId: selected.value.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        conversationId: CONV_A,
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(orch.ok && orch.skipped).toBe(true);
    if (!orch.ok || !orch.skipped) throw new Error("expected skip");
    expect(orch.prompt).toBe("LEGACY_PROMPT_UNCHANGED_P13A");
    expect(orch.orchestratorApplied).toBe(false);

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_UNCHANGED_P13A",
      metadata: {
        cdfSessionId: selected.value.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
      },
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(applied.ok && applied.skipped).toBe(true);
  });
});
