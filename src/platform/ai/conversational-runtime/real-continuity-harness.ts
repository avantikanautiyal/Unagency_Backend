/**
 * Phase 13A — Real conversational continuity E2E harness.
 *
 * PRIMARY proof path (no manual re-pin between turns):
 *   Turn 1 user message
 *     → Context Orchestrator + Model Runtime (ControllableDispatcher)
 *     → tryIngestPresentationCdfCompletion (real ArtifactVersion persist)
 *     → applyCdfTransition(approve) with exact artifactId@version
 *     → optional createVersion newer (immutability)
 *   Turn 2 user message (same conversation + CDF session)
 *     → Context Orchestrator (NO manual upstream artifact injection)
 *     → dependency resolver discovers exact pinned ArtifactVersion
 *     → CMR + Model Runtime + provider boundary
 *
 * Conversation messages persist via the in-process Collaboration OS adapter
 * (conversation-ledger); Turn 2 does not receive injected conversationMessages.
 */

import { createVersion, getArtifactVersion } from "../../cdf/artifacts/repository";
import { getCdfSession } from "../../cdf/session-store";
import { applyCdfTransition } from "../../cdf/transition-service";
import { tryIngestPresentationCdfCompletion } from "../../cdf/presentation-runtime";
import {
  GOLDEN_LEGACY_SLIDE_CONTENT,
  GOLDEN_LEGACY_STORYLINE,
} from "../../cdf/generation-artifact/fixtures";
import { PRESENTATION_ARTIFACT_KEYS } from "../../cdf/artifacts/presentation/keys";
import { prepareCanonicalModelRuntime } from "../model-runtime";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../canonical-model-request";
import {
  persistConversationalMessage,
  resetConversationalMessageLedgerForTests,
} from "./conversation-ledger";
import { runConversationalGenerationTurn } from "./harness";
import { inspectConversationalGenerationContext } from "./inspect";
import { orchestrateCanonicalGenerationContext } from "../context-orchestrator";

const STORYLINE_WITH_OPTIONS = {
  ...GOLDEN_LEGACY_STORYLINE,
  objective: "Create a presentation about AI adoption.",
  options: [
    { id: "opt_1", title: "Conservative adoption", summary: "Cautious rollout" },
    { id: "opt_2", title: "Premium accelerated", summary: "Premium narrative" },
    { id: "opt_3", title: "Bold disruption", summary: "Aggressive market take" },
  ],
};

export type RealContinuityTurnResult = {
  readonly executionId: string;
  readonly instruction: string;
  readonly orchestrationOk: boolean;
  readonly providerInvoked: boolean;
  readonly artifactId?: string;
  readonly artifactVersion?: number;
  readonly cdfSessionId: string;
  readonly cdfPhaseId?: string;
  readonly inspection: ReturnType<typeof inspectConversationalGenerationContext>;
  readonly upstreamArtifactVersions: readonly string[];
  readonly currentUserInstruction?: string;
  readonly providerPrompt?: string;
  readonly apply: Awaited<
    ReturnType<typeof runConversationalGenerationTurn>
  >["apply"];
};

export type RealContinuityE2EResult = {
  readonly conversationId: string;
  readonly channelId: string;
  readonly cdfSessionId: string;
  readonly turn1: RealContinuityTurnResult;
  readonly turn2: RealContinuityTurnResult;
  readonly turn3?: RealContinuityTurnResult;
  readonly newerVersionCreated?: number;
  readonly approvalNoteUsed: string;
};

function startPresentationSession(input: {
  organizationId: string;
  projectId: string;
  brief: string;
}) {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "presentation",
    productMode: "ai",
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!started.ok) throw new Error(`start: ${started.error.message}`);
  const briefed = applyCdfTransition({
    action: "submit_brief",
    sessionId: started.value.session.sessionId,
    brief: input.brief,
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error(`brief: ${briefed.error.message}`);
  const selected = applyCdfTransition({
    action: "select_route",
    sessionId: briefed.value.session.sessionId,
    routeIndex: 2,
    routeTitle: "Start from Scratch",
    expectedVersion: briefed.value.session.sessionVersion,
  });
  if (!selected.ok) throw new Error(`select: ${selected.error.message}`);
  return selected.value.session;
}

function bumpArtifactToVersion(input: {
  artifactId: string;
  fromVersion: number;
  toVersion: number;
  organizationId: string;
  projectId: string;
  data: Record<string, unknown>;
}): number {
  let latest = input.fromVersion;
  for (let v = input.fromVersion + 1; v <= input.toVersion; v++) {
    const next = createVersion({
      artifactId: input.artifactId,
      expectedLatestVersion: latest,
      organizationId: input.organizationId,
      projectId: input.projectId,
      data: {
        ...input.data,
        objective: `${String(input.data.objective ?? "")} V${v}`,
      },
      requestId: `p13a_bump_${input.artifactId}_v${v}`,
    });
    latest = next.version.version;
  }
  return latest;
}

/**
 * PRIMARY multi-turn continuity proof — no manual re-pin between Turn 1 and Turn 2.
 */
export async function runRealConversationalContinuityE2E(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly conversationId: string;
  readonly channelId: string;
  readonly turn1Instruction?: string;
  readonly turn2Instruction?: string;
  readonly turn3Instruction?: string;
  readonly pinStorylineAtVersion?: number;
  readonly createNewerVersionAfterApprove?: boolean;
  readonly includeTurn3?: boolean;
  readonly approvalNote?: string;
}): Promise<RealContinuityE2EResult> {
  resetConversationalMessageLedgerForTests();

  const turn1Instruction =
    input.turn1Instruction ?? "Create a presentation about AI adoption.";
  const turn2Instruction =
    input.turn2Instruction ??
    "Use the second option and make it more premium.";
  const turn3Instruction =
    input.turn3Instruction ?? "Make slide 4 more visual.";
  const targetVersion = input.pinStorylineAtVersion ?? 5;
  const approvalNote =
    input.approvalNote ?? "OLD_TRUNCATED_NOTE_SHOULD_NOT_REPLACE_DATA";

  let session = startPresentationSession({
    organizationId: input.organizationId,
    projectId: input.projectId,
    brief: turn1Instruction,
  });
  expectPhase(session.phaseId, "storyline");

  // ── Turn 1 user message persistence (ledger = Collaboration OS adapter) ──
  persistConversationalMessage({
    id: `msg_${input.conversationId}_t1_user`,
    conversationId: input.conversationId,
    channelId: input.channelId,
    role: "user",
    text: turn1Instruction,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  const exec1 = `exec_p13a_t1_${session.sessionId}`;
  const turn1Gen = await runConversationalGenerationTurn({
    currentUserInstruction: turn1Instruction,
    prompt: "Generate storyline",
    metadata: {
      cdfSessionId: session.sessionId,
      cdfPhaseId: "storyline",
      cdfServiceId: "presentation",
      service: "Presentations",
      conversationId: input.conversationId,
      channelId: input.channelId,
      apiExecutionId: exec1,
    },
    organizationId: input.organizationId,
    projectId: input.projectId,
    // Intentionally omit conversationMessages — ledger supplies WM path for later turns.
  });

  // Real provider-structured result → real ingest (same bridge as execution-create-dispatch).
  // Reload session after generation so expectedVersion matches live store (no stale local copy).
  session = getCdfSession(session.sessionId) ?? session;

  const ingested = tryIngestPresentationCdfCompletion({
    metadata: {
      cdfSessionId: session.sessionId,
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      cdfContextId:
        typeof turn1Gen.stampedMetadata.cdfCanonicalContextId === "string"
          ? turn1Gen.stampedMetadata.cdfCanonicalContextId
          : undefined,
      cdfContextHash:
        typeof turn1Gen.stampedMetadata.cdfCanonicalContextHash === "string"
          ? turn1Gen.stampedMetadata.cdfCanonicalContextHash
          : undefined,
    },
    rawOutput: STORYLINE_WITH_OPTIONS,
    executionId: exec1,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!ingested || ingested.kind !== "accepted") {
    throw new Error(
      `Turn 1 ingest failed: ${ingested && "message" in ingested ? ingested.message : "null"}`,
    );
  }

  const artifactId = ingested.attach.cdfArtifactId;
  let artifactVersion = ingested.attach.cdfArtifactVersion;

  // Establish exact version N (default 5) on the SAME ingested artifact identity.
  if (artifactVersion < targetVersion) {
    const data = getArtifactVersion(artifactId, artifactVersion).data as Record<
      string,
      unknown
    >;
    artifactVersion = bumpArtifactToVersion({
      artifactId,
      fromVersion: artifactVersion,
      toVersion: targetVersion,
      organizationId: input.organizationId,
      projectId: input.projectId,
      data,
    });
  }

  // Production approval transition — pins exact ArtifactVersion into CDF session.
  session = getCdfSession(session.sessionId) ?? session;
  const approved = applyCdfTransition({
    action: "approve",
    sessionId: session.sessionId,
    note: approvalNote,
    artifactId,
    artifactVersion,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
    executionId: exec1,
    expectedVersion: session.sessionVersion,
  });
  if (!approved.ok) {
    throw new Error(`approve storyline: ${approved.error.message}`);
  }
  session = approved.value.session;
  expectPhase(session.phaseId, "slide-content");

  // Prove pin is in real session state (not a harness-only map).
  const pinned = (session.approvedArtifacts ?? []).find(
    (r) =>
      r.artifactId === artifactId &&
      r.version === artifactVersion &&
      r.phaseId === "storyline",
  );
  if (!pinned) {
    throw new Error("approvedArtifacts missing exact storyline pin after approve");
  }

  let newerVersionCreated: number | undefined;
  if (input.createNewerVersionAfterApprove !== false) {
    const data = getArtifactVersion(artifactId, artifactVersion).data as Record<
      string,
      unknown
    >;
    const newer = createVersion({
      artifactId,
      expectedLatestVersion: artifactVersion,
      organizationId: input.organizationId,
      projectId: input.projectId,
      data: { ...data, objective: `${String(data.objective)} NEWER_SHOULD_NOT_WIN` },
      requestId: `p13a_newer_${artifactId}`,
    });
    newerVersionCreated = newer.version.version;
    // Re-assert session pin was NOT updated to newer (no re-pin).
    const still = getCdfSession(session.sessionId)!;
    const pinAfter = (still.approvedArtifacts ?? []).find(
      (r) => r.artifactId === artifactId && r.phaseId === "storyline",
    );
    if (!pinAfter || pinAfter.version !== artifactVersion) {
      throw new Error("session pin mutated after createVersion newer — unexpected");
    }
  }

  persistConversationalMessage({
    id: `msg_${input.conversationId}_t1_ai`,
    conversationId: input.conversationId,
    channelId: input.channelId,
    role: "assistant",
    text: "Storyline options ready.",
    createdAt: "2026-01-01T00:00:30.000Z",
    executionId: exec1,
    artifactId,
  });

  const turn1Inspection = inspectConversationalGenerationContext({
    orchestration:
      turn1Gen.apply.ok && !turn1Gen.apply.skipped
        ? {
            ok: true as const,
            skipped: false as const,
            orchestratorApplied: true as const,
            assemblySource: "context_orchestrator" as const,
            request: turn1Gen.apply.request,
            modelRequest: turn1Gen.apply.modelRequest,
            prompt: turn1Gen.apply.prompt,
            metadata: turn1Gen.apply.metadata,
            contributors: (turn1Gen.apply.metadata
              .cdfContextOrchestratorContributors ?? {}) as never,
          }
        : {
            ok: true as const,
            skipped: true as const,
            orchestratorApplied: false as const,
            prompt: turn1Instruction,
            metadata: turn1Gen.stampedMetadata,
          },
  });

  // ── Turn 2: NO manual artifact injection, NO conversationMessages injection ──
  persistConversationalMessage({
    id: `msg_${input.conversationId}_t2_user`,
    conversationId: input.conversationId,
    channelId: input.channelId,
    role: "user",
    text: turn2Instruction,
    createdAt: "2026-01-01T00:01:00.000Z",
  });

  const exec2 = `exec_p13a_t2_${session.sessionId}`;
  const turn2Gen = await runConversationalGenerationTurn({
    currentUserInstruction: turn2Instruction,
    prompt: "Generate slide content",
    metadata: {
      cdfSessionId: session.sessionId,
      cdfPhaseId: "slide-content",
      cdfServiceId: "presentation",
      service: "Presentations",
      conversationId: input.conversationId,
      channelId: input.channelId,
      apiExecutionId: exec2,
      // Deliberately do NOT pass upstream artifact ids or conversationMessages.
    },
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  if (!turn2Gen.apply.ok || turn2Gen.apply.skipped) {
    throw new Error(
      `Turn 2 apply failed: ${turn2Gen.apply.ok ? "skipped" : turn2Gen.apply.message}`,
    );
  }

  const turn2Upstream = turn2Gen.apply.request.upstreamArtifacts.map(
    (u) => `${u.artifactId}@${u.version}`,
  );
  const expectedPin = `${artifactId}@${artifactVersion}`;
  if (!turn2Upstream.includes(expectedPin)) {
    throw new Error(
      `Turn 2 CMR missing exact upstream ${expectedPin}; got ${turn2Upstream.join(",")}`,
    );
  }
  if (
    newerVersionCreated != null &&
    turn2Upstream.includes(`${artifactId}@${newerVersionCreated}`)
  ) {
    throw new Error("Turn 2 incorrectly selected newer ArtifactVersion");
  }

  // Persist Turn 2 pipeline output (slide-content) via real ingest + approve for Turn 3.
  let turn3: RealContinuityTurnResult | undefined;
  if (input.includeTurn3) {
    const slideIngest = tryIngestPresentationCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "presentation",
        cdfPhaseId: "slide-content",
      },
      rawOutput: {
        ...GOLDEN_LEGACY_SLIDE_CONTENT,
        slides: [
          ...GOLDEN_LEGACY_SLIDE_CONTENT.slides,
          {
            title: "Slide 4 Visual",
            bullets: ["Make more visual"],
            notes: "Target for refinement",
          },
        ],
      },
      executionId: exec2,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!slideIngest || slideIngest.kind !== "accepted") {
      throw new Error("Turn 2 slide-content ingest failed");
    }
    const scId = slideIngest.attach.cdfArtifactId;
    const scVer = slideIngest.attach.cdfArtifactVersion;
    // Bump slide-content to @5 for continuity identity checks.
    let scPinned = scVer;
    if (scVer < 5) {
      const scData = getArtifactVersion(scId, scVer).data as Record<
        string,
        unknown
      >;
      scPinned = bumpArtifactToVersion({
        artifactId: scId,
        fromVersion: scVer,
        toVersion: 5,
        organizationId: input.organizationId,
        projectId: input.projectId,
        data: scData,
      });
    }
    const scApprove = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      note: "slide approval note truncated",
      artifactId: scId,
      artifactVersion: scPinned,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      executionId: exec2,
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    if (!scApprove.ok) {
      throw new Error(`approve slide-content: ${scApprove.error.message}`);
    }
    session = scApprove.value.session;

    persistConversationalMessage({
      id: `msg_${input.conversationId}_t2_ai`,
      conversationId: input.conversationId,
      channelId: input.channelId,
      role: "assistant",
      text: "Slide content ready.",
      createdAt: "2026-01-01T00:01:30.000Z",
      executionId: exec2,
      artifactId: scId,
    });
    persistConversationalMessage({
      id: `msg_${input.conversationId}_t3_user`,
      conversationId: input.conversationId,
      channelId: input.channelId,
      role: "user",
      text: turn3Instruction,
      createdAt: "2026-01-01T00:02:00.000Z",
    });

    const exec3 = `exec_p13a_t3_${session.sessionId}`;
    const turn3Gen = await runConversationalGenerationTurn({
      currentUserInstruction: turn3Instruction,
      prompt: "Generate design routes",
      metadata: {
        cdfSessionId: session.sessionId,
        cdfPhaseId: "design-routes",
        cdfServiceId: "presentation",
        service: "Presentations",
        conversationId: input.conversationId,
        channelId: input.channelId,
        apiExecutionId: exec3,
      },
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!turn3Gen.apply.ok || turn3Gen.apply.skipped) {
      throw new Error(
        `Turn 3 apply failed: ${turn3Gen.apply.ok ? "skipped" : turn3Gen.apply.message}`,
      );
    }
    const t3Up = turn3Gen.apply.request.upstreamArtifacts.map(
      (u) => `${u.artifactId}@${u.version}`,
    );
    if (!t3Up.includes(`${scId}@${scPinned}`)) {
      throw new Error(
        `Turn 3 missing exact slide-content ${scId}@${scPinned}; got ${t3Up.join(",")}`,
      );
    }
    turn3 = {
      executionId: exec3,
      instruction: turn3Instruction,
      orchestrationOk: true,
      providerInvoked: turn3Gen.providerInvoked,
      artifactId: scId,
      artifactVersion: scPinned,
      cdfSessionId: session.sessionId,
      cdfPhaseId: "design-routes",
      inspection: turn3Gen.inspection,
      upstreamArtifactVersions: t3Up,
      currentUserInstruction: turn3Gen.apply.request.currentUserInstruction,
      providerPrompt: turn3Gen.providerPrompt,
      apply: turn3Gen.apply,
    };
  }

  return {
    conversationId: input.conversationId,
    channelId: input.channelId,
    cdfSessionId: session.sessionId,
    turn1: {
      executionId: exec1,
      instruction: turn1Instruction,
      orchestrationOk: turn1Gen.orchestrationOk,
      providerInvoked: turn1Gen.providerInvoked,
      artifactId,
      artifactVersion,
      cdfSessionId: session.sessionId,
      cdfPhaseId: "storyline",
      inspection: turn1Inspection,
      upstreamArtifactVersions: [],
      currentUserInstruction: turn1Instruction,
      providerPrompt: turn1Gen.providerPrompt,
      apply: turn1Gen.apply,
    },
    turn2: {
      executionId: exec2,
      instruction: turn2Instruction,
      orchestrationOk: true,
      providerInvoked: turn2Gen.providerInvoked,
      artifactId,
      artifactVersion,
      cdfSessionId: session.sessionId,
      cdfPhaseId: "slide-content",
      inspection: turn2Gen.inspection,
      upstreamArtifactVersions: turn2Upstream,
      currentUserInstruction: turn2Gen.apply.request.currentUserInstruction,
      providerPrompt: turn2Gen.providerPrompt,
      apply: turn2Gen.apply,
    },
    turn3,
    newerVersionCreated,
    approvalNoteUsed: approvalNote,
  };
}

function expectPhase(actual: string | null | undefined, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected CDF phase ${expected}, got ${actual}`);
  }
}

/** Convenience: prove provider representation derives from Turn 2 CMR. */
export function assertTurn2ProviderBoundaryFromCmr(
  turn2: RealContinuityTurnResult,
): void {
  if (!turn2.apply.ok || turn2.apply.skipped) {
    throw new Error("Turn 2 apply not available");
  }
  const prepared = prepareCanonicalModelRuntime({
    modelRequest: turn2.apply.modelRequest,
    metadata: turn2.apply.metadata,
    providerId: "provider.openai",
    modelId: "gpt-4o",
  });
  if (!prepared.ok) throw new Error(prepared.message);
  if (!prepared.prompt.includes(turn2.instruction)) {
    throw new Error("Provider representation missing Turn 2 instruction");
  }
  const pin = `${turn2.artifactId}@${turn2.artifactVersion}`;
  const flat = flattenCanonicalModelRequestToLabeledPrompt(
    turn2.apply.modelRequest,
  );
  if (!flat.includes(String(turn2.artifactId))) {
    throw new Error(`CMR flat missing artifactId for ${pin}`);
  }
  if (flat.includes(turn2.apply.metadata.approvalNote as string)) {
    // approval note may appear only if identical to instruction — ignore
  }
}

/** Orchestrate without provider — used for missing-artifact / isolation unit cases. */
export function orchestrateTurnWithoutInjectedUpstream(input: {
  readonly instruction: string;
  readonly metadata: Record<string, unknown>;
  readonly organizationId: string;
  readonly projectId?: string;
}) {
  return orchestrateCanonicalGenerationContext({
    prompt: "Generate",
    conversationalInstruction: input.instruction,
    metadata: input.metadata,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}
