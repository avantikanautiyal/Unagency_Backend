/**
 * Phase 10 — Context Orchestrator.
 *
 * Thin orchestration boundary: accepts generation intent, coordinates existing
 * Phase 2–9A contributors via tryApplyCanonicalGenerationContext / applyEnabled,
 * and returns ONE CanonicalModelRequest. Does not invent requirements, resolve
 * auth, flatten provider prompts, or duplicate subsystem logic.
 */

import { tryApplyCanonicalGenerationContext } from "../../cdf/generation-context/apply";
import { detectCanonicalSectionsFromModelRequest } from "../../cdf/generation-context/compile-model-request";
import { CDF_CANONICAL_CONTEXT_META } from "../../cdf/generation-context/flag";
import {
  buildConversationalGenerationIntent,
  stampConversationalIntentMetadata,
  stampConversationalTurnLinkage,
  deriveConversationalTurnLinkage,
  resolveCanonicalConversationalInstruction,
  emitConversationalGenerationIntentTrace,
  emitConversationalGenerationContextTrace,
  emitConversationalGenerationFailedTrace,
} from "../conversational-runtime";
import {
  emitContextOrchestratorAppliedTrace,
  emitContextOrchestratorFailedTrace,
  emitContextOrchestratorSkippedTrace,
} from "./trace";
import {
  CONTEXT_ORCHESTRATOR_SOURCE,
  type ContextContributorPresence,
  type ContextOrchestrationInput,
  type ContextOrchestrationResult,
} from "./types";

function executionIdFromMeta(
  metadata: Record<string, unknown>,
): string | undefined {
  if (typeof metadata.apiExecutionId === "string" && metadata.apiExecutionId.trim()) {
    return metadata.apiExecutionId.trim();
  }
  if (typeof metadata.executionId === "string" && metadata.executionId.trim()) {
    return metadata.executionId.trim();
  }
  return undefined;
}

function contributorsFromModelRequest(
  modelRequest: Parameters<typeof detectCanonicalSectionsFromModelRequest>[0],
): ContextContributorPresence {
  const s = detectCanonicalSectionsFromModelRequest(modelRequest);
  return {
    requirements: s.requirements,
    decisions: s.approvedDecisions,
    references: s.resolvedReferences,
    workingMemory: s.workingMemory,
    multimodal: s.multimodalContext,
    upstreamArtifacts: s.upstreamArtifacts,
    activeBrief: s.activeBrief,
    cdfPhase: s.cdfPhase,
    productionSpec: s.productionSpec,
    outputContract: s.outputContract,
    outputRequirements: s.outputRequirements,
  };
}

/**
 * Single canonical context assembly entry for CDF generation when the flag is ON.
 * Flag OFF / non-CDF creates → skipped (legacy unchanged).
 */
export function orchestrateCanonicalGenerationContext(
  input: ContextOrchestrationInput,
): ContextOrchestrationResult {
  const fromMeta = resolveCanonicalConversationalInstruction(input.metadata);
  const explicitInstruction =
    typeof input.conversationalInstruction === "string" &&
    input.conversationalInstruction.trim()
      ? input.conversationalInstruction.trim()
      : fromMeta;
  const inputWithInstruction: ContextOrchestrationInput = {
    ...input,
    // Prefer explicit current-turn instruction; never promote CTI effectiveInstruction.
    conversationalInstruction: explicitInstruction,
  };
  const intent = buildConversationalGenerationIntent({
    currentUserInstruction: explicitInstruction ?? "",
    metadata: inputWithInstruction.metadata,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const inputWithIntent: ContextOrchestrationInput = {
    ...inputWithInstruction,
    metadata: stampConversationalIntentMetadata(
      { ...inputWithInstruction.metadata },
      intent,
    ),
  };

  emitConversationalGenerationIntentTrace({
    conversationIdPresent: intent.conversationIdentityPresent,
    channelIdPresent: Boolean(intent.channelId),
    cdfSessionId: intent.cdfSessionId,
    cdfPhaseId: intent.cdfPhaseId,
    executionId: intent.executionId ?? executionIdFromMeta(input.metadata),
    inventedConversation: false,
  });

  const result = tryApplyCanonicalGenerationContext(inputWithIntent);
  const executionId = executionIdFromMeta(inputWithIntent.metadata);

  if (!result.ok) {
    emitContextOrchestratorFailedTrace({
      code: result.code,
      message: result.message,
      executionId,
    });
    emitConversationalGenerationFailedTrace({
      code: result.code,
      message: result.message,
      executionId,
      cdfSessionId: intent.cdfSessionId,
      cdfPhaseId: intent.cdfPhaseId,
    });
    return {
      ok: false,
      orchestratorApplied: false,
      code: result.code,
      message: result.message,
      details: result.details,
    };
  }

  if (result.skipped) {
    const reason =
      result.metadata[CDF_CANONICAL_CONTEXT_META.enabled] === false
        ? "flag_off"
        : "not_cdf_phase_or_skipped";
    emitContextOrchestratorSkippedTrace({ reason, executionId });
    return {
      ok: true,
      skipped: true,
      orchestratorApplied: false,
      prompt: result.prompt,
      metadata: {
        ...result.metadata,
        cdfContextOrchestratorApplied: false,
        cdfContextOrchestratorSkipped: true,
      },
    };
  }

  const contributors = contributorsFromModelRequest(result.modelRequest);
  const sections = detectCanonicalSectionsFromModelRequest(result.modelRequest);
  const upstreamSummary = Array.isArray(result.metadata.cdfCanonicalUpstream)
    ? (result.metadata.cdfCanonicalUpstream as Array<Record<string, unknown>>)
    : [];
  const artifactVersions = Array.isArray(result.metadata.cdfArtifactVersions)
    ? (result.metadata.cdfArtifactVersions as string[])
    : upstreamSummary
        .map((u) => {
          const id = typeof u.artifactId === "string" ? u.artifactId : "";
          const v = typeof u.version === "number" ? u.version : undefined;
          return id && v !== undefined ? `${id}@${v}` : "";
        })
        .filter(Boolean);

  const linkage = deriveConversationalTurnLinkage({
    metadata: result.metadata,
    conversationId: intent.conversationId,
    channelId: intent.channelId,
    executionId,
  });

  const stampedMeta: Record<string, unknown> = stampConversationalTurnLinkage(
    {
      ...result.metadata,
      [CDF_CANONICAL_CONTEXT_META.contextOrchestratorApplied]: true,
      cdfContextOrchestratorSkipped: false,
      cdfContextOrchestratorSource: CONTEXT_ORCHESTRATOR_SOURCE,
      [CDF_CANONICAL_CONTEXT_META.canonicalAssemblySource]:
        CONTEXT_ORCHESTRATOR_SOURCE,
      cdfContextOrchestratorContributors: contributors,
    },
    linkage,
  );

  emitConversationalGenerationContextTrace({
    conversationIdPresent: intent.conversationIdentityPresent,
    channelIdPresent: Boolean(intent.channelId),
    cdfSessionId: intent.cdfSessionId,
    cdfPhaseId: intent.cdfPhaseId,
    executionId,
    generationContextHash:
      typeof stampedMeta[CDF_CANONICAL_CONTEXT_META.hash] === "string"
        ? (stampedMeta[CDF_CANONICAL_CONTEXT_META.hash] as string)
        : result.request.generationContextHash,
    upstreamArtifactCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.upstreamCount] ?? 0,
    ),
    workingMemoryTurnCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.workingMemoryTurnCount] ?? 0,
    ),
    referenceCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] ?? 0,
    ),
    multimodalItemCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.multimodalItemCount] ?? 0,
    ),
  });

  emitContextOrchestratorAppliedTrace({
    cdfSessionId:
      typeof stampedMeta.cdfSessionId === "string"
        ? stampedMeta.cdfSessionId
        : undefined,
    cdfPhaseId:
      typeof stampedMeta.cdfPhaseId === "string"
        ? stampedMeta.cdfPhaseId
        : undefined,
    executionId,
    correlationId:
      typeof stampedMeta.correlationId === "string"
        ? stampedMeta.correlationId
        : executionId,
    generationContextHash:
      typeof stampedMeta[CDF_CANONICAL_CONTEXT_META.hash] === "string"
        ? (stampedMeta[CDF_CANONICAL_CONTEXT_META.hash] as string)
        : result.request.generationContextHash,
    contributors,
    requirementCount: Array.isArray(result.request.requirements)
      ? result.request.requirements.length
      : undefined,
    decisionCount: Array.isArray(result.request.approvedDecisions)
      ? result.request.approvedDecisions.length
      : undefined,
    referenceCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] ?? 0,
    ),
    workingMemoryCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.workingMemoryItemCount] ?? 0,
    ),
    multimodalItemCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.multimodalItemCount] ?? 0,
    ),
    upstreamArtifactCount: Number(
      stampedMeta[CDF_CANONICAL_CONTEXT_META.upstreamCount] ?? 0,
    ),
    artifactVersions,
    productionSpecPresent: sections.productionSpec,
    outputContractPresent: sections.outputContract,
  });

  return {
    ok: true,
    skipped: false,
    orchestratorApplied: true,
    assemblySource: CONTEXT_ORCHESTRATOR_SOURCE,
    request: result.request,
    modelRequest: result.modelRequest,
    prompt: result.prompt,
    metadata: stampedMeta,
    contributors,
  };
}
