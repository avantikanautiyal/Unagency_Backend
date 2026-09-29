/**
 * Phase 13 — Application-level conversational continuity harness.
 *
 * Uses the real Context Orchestrator + Model Runtime path via
 * runCanonicalGenerationRuntimeProof. ControllableDispatcher only — no vendor APIs.
 */

import { createHash } from "crypto";
import { CONTEXT_ORCHESTRATOR_SOURCE } from "../context-orchestrator";
import type { ContextOrchestrationResult } from "../context-orchestrator";
import { runCanonicalGenerationRuntimeProof } from "../../cdf/generation-context/runtime-proof";
import type { WorkingMemorySourceMessage } from "../conversation-working-memory";
import {
  buildConversationalGenerationIntent,
  stampConversationalIntentMetadata,
} from "./intent";
import {
  assertInspectionOmitsSensitiveBodies,
  inspectConversationalGenerationContext,
  type ConversationalContextInspection,
} from "./inspect";
import {
  deriveConversationalTurnLinkage,
  stampConversationalTurnLinkage,
  type ConversationalTurnLinkage,
} from "./linkage";
import {
  emitConversationalGenerationCompletedTrace,
  emitConversationalGenerationContextTrace,
  emitConversationalGenerationFailedTrace,
  emitConversationalGenerationIntentTrace,
} from "./trace";

function hashId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function orchestrationFromProofApply(
  apply: Awaited<ReturnType<typeof runCanonicalGenerationRuntimeProof>>["apply"],
): ContextOrchestrationResult {
  if (!apply.ok) {
    return {
      ok: false,
      orchestratorApplied: false,
      code: apply.code,
      message: apply.message,
      details: apply.details,
    };
  }
  if (apply.skipped) {
    return {
      ok: true,
      skipped: true,
      orchestratorApplied: false,
      prompt: apply.prompt,
      metadata: apply.metadata,
    };
  }
  const contributorsRaw = apply.metadata.cdfContextOrchestratorContributors;
  const contributors =
    contributorsRaw && typeof contributorsRaw === "object"
      ? (contributorsRaw as {
          requirements: boolean;
          decisions: boolean;
          references: boolean;
          workingMemory: boolean;
          multimodal: boolean;
          upstreamArtifacts: boolean;
          activeBrief: boolean;
          cdfPhase: boolean;
          productionSpec: boolean;
          outputContract: boolean;
          outputRequirements: boolean;
        })
      : {
          requirements: false,
          decisions: false,
          references: false,
          workingMemory: false,
          multimodal: false,
          upstreamArtifacts: false,
          activeBrief: false,
          cdfPhase: false,
          productionSpec: false,
          outputContract: false,
          outputRequirements: false,
        };
  return {
    ok: true,
    skipped: false,
    orchestratorApplied: true,
    assemblySource: CONTEXT_ORCHESTRATOR_SOURCE,
    request: apply.request,
    modelRequest: apply.modelRequest,
    prompt: apply.prompt,
    metadata: apply.metadata,
    contributors,
  };
}

export type ConversationalTurnProofInput = {
  readonly currentUserInstruction: string;
  readonly prompt?: string;
  readonly metadata: Record<string, unknown>;
  readonly organizationId: string;
  readonly projectId?: string;
  readonly conversationMessages?: WorkingMemorySourceMessage[];
  readonly executionId?: string;
  readonly producedArtifactId?: string;
  readonly producedArtifactVersion?: number;
  readonly skipProviderOnApplyFailure?: boolean;
};

export type ConversationalTurnProofResult = {
  readonly intent: ReturnType<typeof buildConversationalGenerationIntent>;
  readonly inspection: ConversationalContextInspection;
  readonly linkage: ConversationalTurnLinkage;
  readonly orchestrationOk: boolean;
  readonly orchestratorApplied: boolean;
  readonly providerInvoked: boolean;
  readonly currentUserInstruction: string;
  readonly modelRequestPresent: boolean;
  readonly stampedMetadata: Record<string, unknown>;
  readonly providerPrompt: string;
  readonly engineOk?: boolean;
  readonly engineError?: string;
  readonly applyCode?: string;
  readonly apply: Awaited<
    ReturnType<typeof runCanonicalGenerationRuntimeProof>
  >["apply"];
};

/**
 * Single conversational generation turn through intent → orchestrator → runtime.
 */
export async function runConversationalGenerationTurn(
  input: ConversationalTurnProofInput,
): Promise<ConversationalTurnProofResult> {
  const intent = buildConversationalGenerationIntent({
    currentUserInstruction: input.currentUserInstruction,
    metadata: input.metadata,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  emitConversationalGenerationIntentTrace({
    conversationIdPresent: intent.conversationIdentityPresent,
    channelIdPresent: Boolean(intent.channelId),
    conversationIdHash: hashId(intent.conversationId),
    cdfSessionId: intent.cdfSessionId,
    cdfPhaseId: intent.cdfPhaseId,
    executionId: intent.executionId ?? input.executionId,
    inventedConversation: false,
  });

  const metadata = stampConversationalIntentMetadata(
    { ...input.metadata },
    intent,
  );

  const proof = await runCanonicalGenerationRuntimeProof({
    prompt: input.prompt ?? input.currentUserInstruction,
    metadata,
    organizationId: input.organizationId,
    projectId: input.projectId,
    conversationalInstruction: input.currentUserInstruction,
    conversationMessages: input.conversationMessages,
    executionId: input.executionId,
    skipProviderOnApplyFailure: input.skipProviderOnApplyFailure,
  });

  const orchestration = orchestrationFromProofApply(proof.apply);
  const representationStrategy =
    typeof proof.stampedMetadata.modelRuntimeRepresentationStrategy === "string"
      ? proof.stampedMetadata.modelRuntimeRepresentationStrategy
      : undefined;

  const inspection = inspectConversationalGenerationContext({
    orchestration,
    representationStrategy,
  });
  assertInspectionOmitsSensitiveBodies(inspection);

  emitConversationalGenerationContextTrace({
    conversationIdPresent: inspection.conversationIdPresent,
    channelIdPresent: inspection.channelIdPresent,
    conversationIdHash: hashId(intent.conversationId),
    cdfSessionId: inspection.cdfSessionId,
    cdfPhaseId: inspection.cdfPhaseId,
    executionId: inspection.executionId,
    generationContextHash: inspection.generationContextHash,
    upstreamArtifactCount: inspection.upstreamArtifactCount,
    workingMemoryTurnCount: inspection.workingMemoryTurnCount,
    referenceCount: inspection.referenceCount,
    multimodalItemCount: inspection.multimodalItemCount,
  });

  const linkage = deriveConversationalTurnLinkage({
    metadata: proof.stampedMetadata,
    conversationId: intent.conversationId,
    channelId: intent.channelId,
    executionId: inspection.executionId,
    producedArtifactId: input.producedArtifactId,
    producedArtifactVersion: input.producedArtifactVersion,
  });
  const stampedMetadata = stampConversationalTurnLinkage(
    proof.stampedMetadata,
    linkage,
  );

  if (!proof.apply.ok) {
    emitConversationalGenerationFailedTrace({
      executionId: inspection.executionId,
      cdfSessionId: intent.cdfSessionId,
      cdfPhaseId: intent.cdfPhaseId,
      code: proof.apply.code,
      message: proof.apply.message,
    });
  } else {
    emitConversationalGenerationCompletedTrace({
      executionId: inspection.executionId,
      cdfSessionId: intent.cdfSessionId,
      cdfPhaseId: intent.cdfPhaseId,
      generationContextHash: inspection.generationContextHash,
      upstreamArtifactCount: inspection.upstreamArtifactCount,
      workingMemoryTurnCount: inspection.workingMemoryTurnCount,
      referenceCount: inspection.referenceCount,
      multimodalItemCount: inspection.multimodalItemCount,
    });
  }

  return {
    intent,
    inspection,
    linkage,
    orchestrationOk: proof.apply.ok,
    orchestratorApplied:
      proof.apply.ok &&
      !proof.apply.skipped &&
      (proof.stampedMetadata.cdfContextOrchestratorApplied === true ||
        Boolean(proof.apply.modelRequest)),
    providerInvoked: proof.providerInvoked,
    currentUserInstruction: input.currentUserInstruction,
    modelRequestPresent: Boolean(
      proof.apply.ok && !proof.apply.skipped && proof.apply.modelRequest,
    ),
    stampedMetadata,
    providerPrompt: proof.providerPrompt,
    engineOk: proof.engineOk,
    engineError: proof.engineError,
    applyCode: proof.apply.ok ? undefined : proof.apply.code,
    apply: proof.apply,
  };
}

export type ConversationalContinuityHarnessResult = {
  readonly turn1: ConversationalTurnProofResult;
  readonly turn2: ConversationalTurnProofResult;
  readonly turn3?: ConversationalTurnProofResult;
};

/**
 * Multi-turn continuity proof: Turn1 → (artifact pinned externally) → Turn2 → optional Turn3.
 * Artifact creation/approval remains the caller's responsibility (real CDF session).
 */
export async function runConversationalContinuityProof(input: {
  readonly turn1: ConversationalTurnProofInput;
  readonly turn2: ConversationalTurnProofInput;
  readonly turn3?: ConversationalTurnProofInput;
}): Promise<ConversationalContinuityHarnessResult> {
  const turn1 = await runConversationalGenerationTurn(input.turn1);
  const turn2 = await runConversationalGenerationTurn(input.turn2);
  const turn3 = input.turn3
    ? await runConversationalGenerationTurn(input.turn3)
    : undefined;
  return { turn1, turn2, turn3 };
}
