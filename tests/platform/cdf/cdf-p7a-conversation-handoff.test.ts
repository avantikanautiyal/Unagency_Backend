/**
 * Phase 7A — Live conversation working-memory handoff.
 * Proves conversationId alone can identify the store handle; channelId not required.
 */

import {
  applyCdfTransition,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  createArtifact,
  createVersion,
  detectCanonicalSectionsFromModelRequest,
  fixturePresentationStoryline,
  getCdfSession,
  markApproved,
  PRESENTATION_ARTIFACT_KEYS,
  resetCanonicalGenerationTracesForTests,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveWorkingMemoryConversationHandoff,
  runCanonicalGenerationRuntimeProof,
  saveCdfSession,
  tryApplyCanonicalGenerationContext,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import type { WorkingMemorySourceMessage } from "../../../src/platform/ai/conversation-working-memory";

const ORG = "org_p7a_handoff";
const PROJ = "proj_p7a_handoff";
const CONV_C1 = "507f1f77bcf86cd799439011"; // valid ObjectId shape
const CONV_C2 = "507f1f77bcf86cd799439012";
const CHANNEL_C1 = "service:brand_x:presentations";

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
    conversationId: partial.conversationId ?? CONV_C1,
    channelId: partial.channelId ?? CHANNEL_C1,
    ...partial,
  };
}

function approveStorylineAtVersion(
  sessionIn: ReturnType<typeof startBrief>,
  targetVersion: number,
  marker: string,
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
    data: {
      ...fixturePresentationStoryline(),
      objective: `${marker}_V1`,
    } as unknown as Record<string, unknown>,
    requestId: `p7a_${marker}_v1`,
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
        objective: `${marker}_V${v}`,
        truncationProofTail: `${marker}_TAIL`,
      } as unknown as Record<string, unknown>,
      requestId: `p7a_${marker}_v${v}`,
    });
    latest = next.version.version;
  }
  markApproved(artifactId, targetVersion, {
    organizationId: ORG,
    projectId: PROJ,
  });
  const ap = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: "approval note only",
    artifactId,
    artifactVersion: targetVersion,
    expectedVersion: session.sessionVersion,
  });
  if (!ap.ok) throw new Error(ap.error.message);
  session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
    artifactId,
    version: targetVersion,
    phaseId: "storyline",
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    role: "approved",
  });
  saveCdfSession(session);
  return {
    session: getCdfSession(session.sessionId)!,
    artifactId,
    version: targetVersion,
  };
}

describe("Phase 7A Live Conversation Working-Memory Handoff", () => {
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

  it("conversationId alone yields storeHandle (channelId not required)", () => {
    const handoff = resolveWorkingMemoryConversationHandoff({
      conversationId: CONV_C1,
      cdfSessionId: "cdf_x",
      cdfPhaseId: "slide-content",
    });
    expect(handoff.conversationIdPresent).toBe(true);
    expect(handoff.channelIdPresent).toBe(false);
    expect(handoff.storeHandle).toBe(CONV_C1);
  });

  it("channelId preferred as storeHandle when both present", () => {
    const handoff = resolveWorkingMemoryConversationHandoff({
      conversationId: CONV_C1,
      channelId: CHANNEL_C1,
    });
    expect(handoff.storeHandle).toBe(CHANNEL_C1);
    expect(handoff.channelIdPresent).toBe(true);
    expect(handoff.conversationIdPresent).toBe(true);
  });

  it("no-channelId live CDF path: WM populated when conversationId + messages available", () => {
    const pinned = approveStorylineAtVersion(
      selectSource(startBrief()),
      1,
      "NO_CH",
    );
    const instruction = "Also make the CTA stronger.";
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate slide content",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        // Intentionally omit channelId — conversationId is sufficient identity.
        conversationId: CONV_C1,
      },
      organizationId: ORG,
      projectId: PROJ,
      // Simulates prepass listMessages(storeHandle=conversationId) result.
      conversationMessages: [
        msg({
          id: "c1_u1",
          role: "user",
          text: "Use a clean premium visual direction.",
          createdAt: "2026-02-01T10:00:00.000Z",
          conversationId: CONV_C1,
          channelId: undefined,
        }),
        msg({
          id: "c1_a1",
          role: "assistant",
          text: "Understood. We'll keep the existing structure and make the visual language more premium.",
          createdAt: "2026-02-01T10:01:00.000Z",
          conversationId: CONV_C1,
          channelId: undefined,
        }),
        msg({
          id: "c1_u2",
          role: "user",
          text: instruction,
          createdAt: "2026-02-01T10:02:00.000Z",
          conversationId: CONV_C1,
          channelId: undefined,
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    expect(applied.metadata.cdfConversationIdPresent).toBe(true);
    expect(applied.metadata.cdfChannelIdPresent).toBe(false);
    expect(applied.metadata.cdfConversationContextAvailable).toBe(true);
    expect(applied.metadata.cdfConversationMessageCountLoaded).toBe(3);
    expect(applied.metadata.cdfWorkingMemoryApplied).toBe(true);
    expect(applied.request.currentUserInstruction).toBe(instruction);
    expect(applied.request.workingMemory?.applied).toBe(true);
    const wmTexts = (applied.request.workingMemory?.items ?? []).map((i) => i.text);
    expect(wmTexts.some((t) => t.includes("clean premium"))).toBe(true);
    expect(wmTexts).not.toContain(instruction);

    const sections = detectCanonicalSectionsFromModelRequest(applied.modelRequest);
    expect(sections.workingMemory).toBe(true);
    expect(sections.currentUserInstruction).toBe(true);
    const flat = flattenCanonicalModelRequestToLabeledPrompt(applied.modelRequest);
    expect(flat).toContain("===== WORKING MEMORY =====");
    expect(flat).toContain("clean premium");
    expect(flat).toContain(`===== CURRENT USER INSTRUCTION =====\n${instruction}`);
  });

  it("session isolation: C2 messages never enter C1 generation", () => {
    const pinned = approveStorylineAtVersion(
      selectSource(startBrief()),
      1,
      "ISO",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Polish the deck.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV_C1,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "c1",
          role: "user",
          text: "C1 relevant preference: minimal premium.",
          createdAt: "2026-02-02T10:00:00.000Z",
          conversationId: CONV_C1,
        }),
        msg({
          id: "c2",
          role: "user",
          text: "C2 unrelated packaging boxes brief.",
          createdAt: "2026-02-02T10:01:00.000Z",
          conversationId: CONV_C2,
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const blob = JSON.stringify(applied.request.workingMemory);
    expect(blob).toContain("minimal premium");
    expect(blob).not.toContain("packaging boxes");
  });

  it("original bug: A@5 upstream + WM + instruction remain separate channels", async () => {
    const pinned = approveStorylineAtVersion(
      selectSource(startBrief()),
      5,
      "P7A_A5",
    );
    const instruction = "Use the previous output and tighten the CTA.";
    const proof = await runCanonicalGenerationRuntimeProof({
      prompt: "Generate slide content",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV_C1,
        apiExecutionId: "exec_p7a_a5",
      },
      organizationId: ORG,
      projectId: PROJ,
      executionId: "exec_p7a_a5",
      conversationMessages: [
        msg({
          id: "ref",
          role: "user",
          text: "That storyline felt strong — keep refining it.",
          createdAt: "2026-02-03T10:00:00.000Z",
          artifactId: pinned.artifactId,
        }),
        msg({
          id: "cur",
          role: "user",
          text: instruction,
          createdAt: "2026-02-03T10:01:00.000Z",
        }),
      ],
    });
    expect(proof.providerInvoked).toBe(true);
    expect(proof.apply.ok).toBe(true);
    if (!proof.apply.ok || proof.apply.skipped) throw new Error("expected applied");

    const up = proof.apply.request.upstreamArtifacts.find(
      (u) => u.artifactId === pinned.artifactId && u.version === 5,
    );
    expect(up).toBeDefined();
    expect(JSON.stringify(up?.data)).toContain("P7A_A5_V5");
    expect(JSON.stringify(up?.data)).toContain("P7A_A5_TAIL");
    expect(proof.apply.request.currentUserInstruction).toBe(instruction);
    expect(proof.apply.request.workingMemory?.applied).toBe(true);
    expect(JSON.stringify(proof.apply.request.workingMemory)).not.toContain(
      "P7A_A5_V5",
    );
    const prev = proof.apply.request.referenceResolution?.references.find(
      (r) => r.referenceType === "previous_output",
    );
    expect(prev?.artifactId).toBe(pinned.artifactId);
    expect(prev?.version).toBe(5);
    expect(proof.providerPrompt).toContain("===== UPSTREAM ARTIFACTS =====");
    expect(proof.providerPrompt).toContain("P7A_A5_V5");
    expect(proof.providerPrompt).toContain("===== WORKING MEMORY =====");
    expect(proof.providerPrompt).toContain(instruction);
  });

  it("flag OFF: no handoff metadata mutation on legacy skip path", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const session = selectSource(startBrief());
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "legacy",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "slide-content",
        conversationId: CONV_C1,
      },
      organizationId: ORG,
      conversationMessages: [
        msg({
          id: "x",
          role: "user",
          text: "should not apply",
          createdAt: "2026-02-04T00:00:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error("ok");
    expect(applied.skipped).toBe(true);
    if (applied.skipped) {
      expect(applied.prompt).toBe("legacy");
      expect(applied.metadata.cdfWorkingMemoryApplied).toBeUndefined();
      expect(applied.metadata.cdfConversationContextAvailable).toBeUndefined();
    }
  });

  it("excludes internal execution prompts from working memory", () => {
    const pinned = approveStorylineAtVersion(
      selectSource(startBrief()),
      1,
      "INT",
    );
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      conversationalInstruction: "Make the CTA stronger.",
      metadata: {
        cdfSessionId: pinned.session.sessionId,
        cdfPhaseId: "slide-content",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: CONV_C1,
      },
      organizationId: ORG,
      projectId: PROJ,
      conversationMessages: [
        msg({
          id: "int",
          role: "user",
          text: "[User brief]\nINTERNAL_SHOULD_NOT_BE_VISIBLE_AS_CHAT",
          createdAt: "2026-02-05T10:00:00.000Z",
        }),
        msg({
          id: "ok",
          role: "user",
          text: "Prefer a stronger CTA wording.",
          createdAt: "2026-02-05T10:01:00.000Z",
        }),
        msg({
          id: "cur",
          role: "user",
          text: "Make the CTA stronger.",
          createdAt: "2026-02-05T10:02:00.000Z",
        }),
      ],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok || applied.skipped) throw new Error("expected applied");
    const blob = JSON.stringify(applied.request.workingMemory);
    expect(blob).toContain("stronger CTA wording");
    expect(blob).not.toContain("INTERNAL_SHOULD_NOT_BE_VISIBLE_AS_CHAT");
  });
});
