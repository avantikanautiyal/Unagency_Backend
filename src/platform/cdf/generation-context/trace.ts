/**
 * Phase 3 — Canonical generation context runtime traces.
 * Reuses OS execution-trace + sanitized logging. No second telemetry stack.
 * Privacy: IDs, hashes, sizes, section presence — never full prompts/artifact data.
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import {
  recordExecutionTraceStage,
  type ExecutionTraceStage,
} from "../../os/observability/execution-trace";
import type { CanonicalModelRequest } from "../../ai/canonical-model-request";
import { detectCanonicalSectionsFromModelRequest } from "./compile-model-request";
import { CDF_CANONICAL_CONTEXT_META } from "./flag";
import type { ProviderGenerationIntentDiagnostics } from "./provider-intent-diagnostics";
import type { CanonicalGenerationRequest } from "./types";

export const CDF_CANONICAL_TRACE_SCOPE = "cdf.generation_context" as const;

/**
 * Generic diagnostic contract: these counters describe DIFFERENT mechanisms.
 * Do not interpret referenceResolutionApplied=false as "no upstream artifact loaded."
 */
export const CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT = Object.freeze({
  referenceResolution: Object.freeze({
    plane: "reference_resolution",
    meaning: "deictic_conversational_reference_binding",
  }),
  artifactContext: Object.freeze({
    plane: "artifact_context",
    meaning: "exact_artifactversion_upstream_load",
  }),
  selectedExactArtifact: Object.freeze({
    plane: "selected_exact_artifact",
    meaning: "session_selected_or_generated_artifact_pin",
  }),
  selectedSemanticDirection: Object.freeze({
    plane: "selected_semantic_direction",
    meaning: "exact_parent_xv_choice_slice",
  }),
});

export function buildCdfContextDiagnosticPlanes(input: {
  readonly referenceResolutionApplied?: boolean;
  readonly resolvedReferenceCount?: number;
  readonly unresolvedReferenceCount?: number;
  readonly artifactContextApplied?: boolean;
  readonly requiredArtifactCount?: number;
  readonly loadedArtifactCount?: number;
  readonly artifactVersions?: readonly string[];
  readonly selectedDirectionPresent?: boolean;
  readonly selectedDirectionIdentity?: string;
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    referenceResolution: Object.freeze({
      ...CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT.referenceResolution,
      applied: input.referenceResolutionApplied === true,
      resolvedCount: input.resolvedReferenceCount ?? 0,
      unresolvedCount: input.unresolvedReferenceCount ?? 0,
    }),
    artifactContext: Object.freeze({
      ...CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT.artifactContext,
      applied: input.artifactContextApplied === true,
      requiredCount: input.requiredArtifactCount ?? 0,
      loadedCount: input.loadedArtifactCount ?? 0,
      versions: Object.freeze([...(input.artifactVersions ?? [])]),
    }),
    selectedSemanticDirection: Object.freeze({
      ...CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT.selectedSemanticDirection,
      present: input.selectedDirectionPresent === true,
      identity: input.selectedDirectionIdentity,
    }),
  });
}

export const CANONICAL_SECTION_MARKERS = [
  "CURRENT TASK",
  "CURRENT USER INSTRUCTION",
  "REQUIREMENTS",
  "CONSTRAINTS",
  "EXCLUSIONS",
  "SELECTIONS",
  "APPROVED DECISIONS",
  "CDF PHASE",
  "UPSTREAM ARTIFACTS",
  "OUTPUT CONTRACT",
  "AUTHORITY",
] as const;

export type CanonicalSectionMarker = (typeof CANONICAL_SECTION_MARKERS)[number];

export type CanonicalSectionsPresent = Record<
  | "currentTask"
  | "currentUserInstruction"
  | "resolvedReferences"
  | "workingMemory"
  | "multimodalContext"
  | "requirements"
  | "constraints"
  | "exclusions"
  | "selections"
  | "selectedSemanticDirections"
  | "brandContext"
  | "productGrounding"
  | "approvedDecisions"
  | "activeBrief"
  | "cdfPhase"
  | "upstreamArtifacts"
  | "productionSpec"
  | "outputContract"
  | "outputRequirements"
  | "authority",
  boolean
>;

export type CanonicalUpstreamTraceRef = {
  artifactId: string;
  version: number;
  artifactKey: string;
  phaseId: string;
  role: string;
  status?: string;
  schemaVersion?: string;
  dataBytes: number;
  contentHash: string;
};

export type CanonicalGenerationTraceEvent =
  | {
      event: "cdf.generation_context.compiled";
      ts: string;
      cdfSessionId?: string;
      cdfPhaseId?: string;
      executionId?: string;
      correlationId?: string;
      serviceId?: string;
      canonicalContextApplied: true;
      generationContextHash: string;
      contextId?: string;
      activeBriefId?: string;
      activeBriefVersion?: number;
      upstreamArtifacts: CanonicalUpstreamTraceRef[];
      sectionsPresent: CanonicalSectionsPresent;
      contextSize: number;
      /** Prompt length unknown until provider flatten; 0 at compile. */
      promptLength: number;
      messageCount?: number;
      contentPartCount?: number;
      structuredPartCount?: number;
      canonicalModelRequestApplied?: boolean;
      canonicalFullDeck: boolean;
      referenceResolutionApplied?: boolean;
      resolvedReferenceCount?: number;
      unresolvedReferenceCount?: number;
      ambiguousReferenceCount?: number;
      references?: Array<{
        referenceType: string;
        targetType: string;
        status: string;
        artifactId?: string;
        version?: number;
        resolutionMethod: string;
        slideNumber?: number;
      }>;
      workingMemoryApplied?: boolean;
      workingMemoryItemCount?: number;
      workingMemoryCharacterCount?: number;
      workingMemoryTurnCount?: number;
      workingMemorySelectionMethod?: string;
      workingMemoryTruncated?: boolean;
      workingMemoryDroppedItemCount?: number;
      workingMemorySourceConversationId?: string;
      /** Phase 8 — artifact context rehydration (no bodies). */
      artifactContextApplied?: boolean;
      requiredArtifactCount?: number;
      optionalArtifactCount?: number;
      loadedArtifactCount?: number;
      missingArtifactCount?: number;
      skippedOptionalCount?: number;
      artifactContextHash?: string;
      artifactVersions?: readonly string[];
      artifactKeys?: readonly string[];
      artifactPhases?: readonly string[];
      loadedFromReferences?: number;
      /** Phase 9 — multimodal (no bodies/URLs). */
      multimodalContextApplied?: boolean;
      multimodalItemCount?: number;
      multimodalImageCount?: number;
      multimodalDocumentCount?: number;
      multimodalUnsupportedCount?: number;
      multimodalExtractedTextCount?: number;
      multimodalProviderMappedCount?: number;
      multimodalProviderOmittedCount?: number;
      multimodalSelectionMethod?: string;
      outputContract: {
        phaseId: string;
        artifactKey: string;
        generationModality: string;
        canonicalFullDeck: boolean;
      };
    }
  | {
      event: "cdf.generation_context.skipped";
      ts: string;
      cdfSessionId?: string;
      cdfPhaseId?: string;
      executionId?: string;
      canonicalContextApplied: false;
      reason: "flag_off" | "not_cdf_phase" | "other";
    }
  | {
      event: "cdf.generation_context.failed";
      ts: string;
      cdfSessionId?: string;
      cdfPhaseId?: string;
      executionId?: string;
      canonicalContextApplied: false;
      failureCode: string;
      providerInvoked: false;
      dependencyArtifactId?: string;
      dependencyVersion?: number;
      messageSafe?: string;
    }
  | {
      event: "cdf.generation_context.provider_boundary";
      ts: string;
      cdfSessionId?: string;
      cdfPhaseId?: string;
      executionId?: string;
      correlationId?: string;
      provider?: string;
      model?: string;
      canonicalContextApplied: boolean;
      generationContextHash?: string;
      promptLength: number;
      sectionsPresent: CanonicalSectionsPresent;
      upstreamArtifacts: Array<{
        artifactId: string;
        version: number;
        artifactKey: string;
        role?: string;
        contentHash?: string;
      }>;
      outputContractName?: string;
      payloadShape: string[];
      canonicalFullDeck?: boolean;
      canonicalModelRequestApplied?: boolean;
      flattenedByProvider?: boolean;
      messageCount?: number;
      contentPartCount?: number;
      structuredPartCount?: number;
      productionSpecPresent?: boolean;
      outputContractPresent?: boolean;
      referenceResolutionApplied?: boolean;
      resolvedReferenceCount?: number;
      unresolvedReferenceCount?: number;
      ambiguousReferenceCount?: number;
      references?: Array<{
        referenceType: string;
        targetType: string;
        status: string;
        artifactId?: string;
        version?: number;
        resolutionMethod: string;
        slideNumber?: number;
      }>;
      workingMemoryApplied?: boolean;
      workingMemoryItemCount?: number;
      workingMemoryCharacterCount?: number;
      workingMemoryTurnCount?: number;
      workingMemorySelectionMethod?: string;
      workingMemoryTruncated?: boolean;
      workingMemoryDroppedItemCount?: number;
      workingMemorySourceConversationId?: string;
      artifactContextApplied?: boolean;
      requiredArtifactCount?: number;
      optionalArtifactCount?: number;
      loadedArtifactCount?: number;
      missingArtifactCount?: number;
      skippedOptionalCount?: number;
      artifactContextHash?: string;
      artifactVersions?: string[];
      loadedFromReferences?: number;
      /** Disambiguates reference-resolution vs artifact-context counters. */
      diagnosticPlanes?: Readonly<Record<string, unknown>>;
    };

const TRACE_RING_MAX = 200;
const traceRing: CanonicalGenerationTraceEvent[] = [];

export function resetCanonicalGenerationTracesForTests(): void {
  traceRing.length = 0;
}

export function getCanonicalGenerationTraceEvents(): readonly CanonicalGenerationTraceEvent[] {
  return [...traceRing];
}

export function getLatestCanonicalTraceEvent(
  event: CanonicalGenerationTraceEvent["event"],
): CanonicalGenerationTraceEvent | undefined {
  for (let i = traceRing.length - 1; i >= 0; i--) {
    if (traceRing[i]!.event === event) return traceRing[i];
  }
  return undefined;
}

function pushTrace(ev: CanonicalGenerationTraceEvent): void {
  traceRing.push(ev);
  if (traceRing.length > TRACE_RING_MAX) {
    traceRing.splice(0, traceRing.length - TRACE_RING_MAX);
  }
  try {
    console.info(
      JSON.stringify({
        scope: CDF_CANONICAL_TRACE_SCOPE,
        ...sanitizeOsLogFields(ev as unknown as Record<string, unknown>),
      }),
    );
  } catch {
    // Observability must never break generation.
  }
}

export function detectCanonicalSectionsPresent(
  prompt: string,
): CanonicalSectionsPresent {
  const has = (marker: string) =>
    prompt.includes(`===== ${marker} =====`) || prompt.includes(marker);
  return {
    currentTask: has("CURRENT TASK"),
    currentUserInstruction: has("CURRENT USER INSTRUCTION"),
    resolvedReferences: has("RESOLVED REFERENCES"),
    workingMemory: has("WORKING MEMORY"),
    multimodalContext: has("MULTIMODAL CONTEXT"),
    requirements: has("REQUIREMENTS"),
    constraints: has("CONSTRAINTS"),
    exclusions: has("EXCLUSIONS"),
    selections: has("SELECTIONS"),
    selectedSemanticDirections:
      has("SELECTED SEMANTIC DIRECTION") ||
      prompt.includes("selected_semantic_directions"),
    brandContext: has("BRAND CONTEXT") || prompt.includes("brand_context"),
    productGrounding:
      has("PRODUCT GROUNDING") || prompt.includes("product_grounding"),
    approvedDecisions: has("APPROVED DECISIONS"),
    activeBrief: has("ACTIVE BRIEF"),
    cdfPhase: has("CDF PHASE"),
    upstreamArtifacts: has("UPSTREAM ARTIFACTS"),
    productionSpec:
      has("PRODUCTION SPEC") ||
        prompt.includes("[production_constraints]") ||
        prompt.includes("[Format Production Spec]") ||
        prompt.includes("[UNAGENCY Production Spec]"),
    outputContract: has("OUTPUT CONTRACT"),
    outputRequirements:
      has("OUTPUT REQUIREMENTS") || prompt.includes("[Output requirements]"),
    authority: has("AUTHORITY"),
  };
}

function recordStageSafe(
  executionId: string | undefined,
  stage: ExecutionTraceStage,
  status: "COMPLETED" | "SKIPPED" | "FAILED",
  details?: Record<string, unknown>,
  error?: string,
): void {
  if (!executionId) return;
  try {
    recordExecutionTraceStage({
      executionId,
      stage,
      status,
      ...(error ? { error } : {}),
      ...(details ? { details } : {}),
    });
  } catch {
    // ignore
  }
}

export function emitCanonicalContextCompiledTrace(input: {
  request: CanonicalGenerationRequest;
  modelRequest: CanonicalModelRequest;
  executionId?: string;
  correlationId?: string;
  upstream: CanonicalUpstreamTraceRef[];
  artifactContext?: {
    artifactContextApplied?: boolean;
    requiredArtifactCount?: number;
    optionalArtifactCount?: number;
    loadedArtifactCount?: number;
    missingArtifactCount?: number;
    skippedOptionalCount?: number;
    artifactContextHash?: string;
    artifactVersions?: readonly string[];
    artifactKeys?: readonly string[];
    artifactPhases?: readonly string[];
    loadedFromReferences?: number;
  };
  multimodalContext?: {
    multimodalContextApplied?: boolean;
    multimodalItemCount?: number;
    multimodalImageCount?: number;
    multimodalDocumentCount?: number;
    multimodalUnsupportedCount?: number;
    multimodalExtractedTextCount?: number;
    multimodalProviderMappedCount?: number;
    multimodalProviderOmittedCount?: number;
    multimodalSelectionMethod?: string;
  };
  providerIntentDiagnostics?: ProviderGenerationIntentDiagnostics;
}): CanonicalGenerationTraceEvent & { event: "cdf.generation_context.compiled" } {
  const sectionsPresent = detectCanonicalSectionsFromModelRequest(
    input.modelRequest,
  );
  const messageCount = input.modelRequest.metadata?.messageCount;
  const contentPartCount = input.modelRequest.metadata?.contentPartCount;
  const structuredPartCount = input.modelRequest.metadata?.structuredPartCount;
  const refMeta = input.modelRequest.metadata;
  const ac = input.artifactContext;
  const mm = input.multimodalContext;
  const ev = {
    event: "cdf.generation_context.compiled" as const,
    ts: new Date().toISOString(),
    cdfSessionId: input.request.cdfContext.sessionId,
    cdfPhaseId: input.request.cdfContext.phaseId,
    executionId: input.executionId,
    correlationId: input.correlationId,
    serviceId: input.request.cdfContext.serviceId,
    canonicalContextApplied: true as const,
    generationContextHash: input.request.generationContextHash,
    contextId: input.request.cdfContext.contextId,
    activeBriefId: input.request.cdfContext.activeBriefId,
    activeBriefVersion: input.request.cdfContext.activeBriefVersion,
    upstreamArtifacts: input.upstream,
    sectionsPresent,
    contextSize: input.upstream.reduce((n, u) => n + u.dataBytes, 0),
    promptLength: 0,
    messageCount,
    contentPartCount,
    structuredPartCount,
    canonicalModelRequestApplied: true,
    canonicalFullDeck: input.request.outputContract.canonicalFullDeck,
    referenceResolutionApplied:
      refMeta?.referenceResolutionApplied === true ||
      Boolean(input.request.referenceResolution?.applied),
    resolvedReferenceCount:
      typeof refMeta?.resolvedReferenceCount === "number"
        ? refMeta.resolvedReferenceCount
        : input.request.referenceResolution?.resolvedCount ?? 0,
    unresolvedReferenceCount:
      typeof refMeta?.unresolvedReferenceCount === "number"
        ? refMeta.unresolvedReferenceCount
        : input.request.referenceResolution?.unresolvedCount ?? 0,
    ambiguousReferenceCount:
      typeof refMeta?.ambiguousReferenceCount === "number"
        ? refMeta.ambiguousReferenceCount
        : input.request.referenceResolution?.ambiguousCount ?? 0,
    references: (input.request.referenceResolution?.references ?? []).map(
      (r) => ({
        referenceType: r.referenceType,
        targetType: r.targetType,
        status: r.status,
        artifactId: r.artifactId,
        version: r.version,
        resolutionMethod: r.resolutionMethod,
        slideNumber: r.slideNumber,
      }),
    ),
    workingMemoryApplied:
      refMeta?.workingMemoryApplied === true ||
      Boolean(input.request.workingMemory?.applied),
    workingMemoryItemCount:
      typeof refMeta?.workingMemoryItemCount === "number"
        ? refMeta.workingMemoryItemCount
        : input.request.workingMemory?.turnCount ?? 0,
    workingMemoryCharacterCount:
      typeof refMeta?.workingMemoryCharacterCount === "number"
        ? refMeta.workingMemoryCharacterCount
        : input.request.workingMemory?.characterCount ?? 0,
    workingMemoryTurnCount:
      typeof refMeta?.workingMemoryTurnCount === "number"
        ? refMeta.workingMemoryTurnCount
        : input.request.workingMemory?.turnCount ?? 0,
    workingMemorySelectionMethod:
      typeof refMeta?.workingMemorySelectionMethod === "string"
        ? refMeta.workingMemorySelectionMethod
        : input.request.workingMemory?.selectionMethod,
    workingMemoryTruncated:
      refMeta?.workingMemoryTruncated === true ||
      Boolean(input.request.workingMemory?.truncated),
    workingMemoryDroppedItemCount:
      typeof refMeta?.workingMemoryDroppedItemCount === "number"
        ? refMeta.workingMemoryDroppedItemCount
        : input.request.workingMemory?.droppedItemCount ?? 0,
    workingMemorySourceConversationId:
      typeof refMeta?.workingMemorySourceConversationId === "string"
        ? refMeta.workingMemorySourceConversationId
        : input.request.workingMemory?.conversationId,
    artifactContextApplied:
      ac?.artifactContextApplied === true || input.upstream.length > 0,
    requiredArtifactCount: ac?.requiredArtifactCount,
    optionalArtifactCount: ac?.optionalArtifactCount,
    loadedArtifactCount: ac?.loadedArtifactCount ?? input.upstream.length,
    missingArtifactCount: ac?.missingArtifactCount,
    skippedOptionalCount: ac?.skippedOptionalCount,
    artifactContextHash: ac?.artifactContextHash,
    artifactVersions: ac?.artifactVersions,
    artifactKeys: ac?.artifactKeys,
    artifactPhases: ac?.artifactPhases,
    loadedFromReferences: ac?.loadedFromReferences,
    multimodalContextApplied:
      mm?.multimodalContextApplied === true ||
      Boolean(input.request.multimodalContext?.applied),
    multimodalItemCount:
      mm?.multimodalItemCount ?? input.request.multimodalContext?.items.length,
    multimodalImageCount:
      mm?.multimodalImageCount ?? input.request.multimodalContext?.imageCount,
    multimodalDocumentCount:
      mm?.multimodalDocumentCount ??
      input.request.multimodalContext?.documentCount,
    multimodalUnsupportedCount:
      mm?.multimodalUnsupportedCount ??
      input.request.multimodalContext?.unsupportedCount,
    multimodalExtractedTextCount:
      mm?.multimodalExtractedTextCount ??
      input.request.multimodalContext?.extractedTextCount,
    multimodalProviderMappedCount: mm?.multimodalProviderMappedCount,
    multimodalProviderOmittedCount: mm?.multimodalProviderOmittedCount,
    multimodalSelectionMethod: mm?.multimodalSelectionMethod,
    outputContract: {
      phaseId: input.request.outputContract.phaseId,
      artifactKey: input.request.outputContract.artifactKey,
      generationModality: input.request.outputContract.generationModality,
      canonicalFullDeck: input.request.outputContract.canonicalFullDeck,
    },
    ...(input.providerIntentDiagnostics
      ? {
          selectedDirectionPresent:
            input.providerIntentDiagnostics.selectedDirectionPresent,
          selectedDirectionIdentity:
            input.providerIntentDiagnostics.selectedDirectionIdentity,
          selectedDirectionSemanticFields:
            input.providerIntentDiagnostics.selectedDirectionSemanticFields,
          brandContextPresent:
            input.providerIntentDiagnostics.brandContextPresent,
          brandFactKeys: input.providerIntentDiagnostics.brandFactKeys,
          userInstructionPresent:
            input.providerIntentDiagnostics.userInstructionPresent,
          productionSpecPresent:
            input.providerIntentDiagnostics.productionSpecPresent,
          generationIntentHash:
            input.providerIntentDiagnostics.generationIntentHash,
          canonicalModelRequestHash:
            input.providerIntentDiagnostics.canonicalModelRequestHash,
          providerIntentUnresolvedReferenceCount:
            input.providerIntentDiagnostics.unresolvedReferenceCount,
        }
      : {}),
  };
  pushTrace(ev);
  recordStageSafe(input.executionId, "cdf_canonical_context", "COMPLETED", {
    generationContextHash: ev.generationContextHash,
    upstreamCount: ev.upstreamArtifacts.length,
    sectionsPresent: ev.sectionsPresent,
    canonicalFullDeck: ev.canonicalFullDeck,
    messageCount: ev.messageCount,
    contentPartCount: ev.contentPartCount,
    structuredPartCount: ev.structuredPartCount,
    canonicalModelRequestApplied: true,
    artifactContextHash: ac?.artifactContextHash,
    loadedArtifactCount: ac?.loadedArtifactCount ?? input.upstream.length,
    multimodalItemCount: mm?.multimodalItemCount,
  });
  return ev;
}

export function emitCanonicalContextSkippedTrace(input: {
  reason: "flag_off" | "not_cdf_phase" | "other";
  metadata?: Record<string, unknown>;
  executionId?: string;
}): void {
  const meta = input.metadata ?? {};
  const ev = {
    event: "cdf.generation_context.skipped" as const,
    ts: new Date().toISOString(),
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId:
      typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    executionId: input.executionId,
    canonicalContextApplied: false as const,
    reason: input.reason,
  };
  pushTrace(ev);
  recordStageSafe(input.executionId, "cdf_canonical_context", "SKIPPED", {
    reason: input.reason,
  });
}

export function emitCanonicalContextFailedTrace(input: {
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
  executionId?: string;
  details?: Record<string, unknown>;
}): void {
  const meta = input.metadata ?? {};
  const depId =
    typeof input.details?.artifactId === "string"
      ? input.details.artifactId
      : undefined;
  const depVer =
    typeof input.details?.version === "number"
      ? input.details.version
      : undefined;
  const ev = {
    event: "cdf.generation_context.failed" as const,
    ts: new Date().toISOString(),
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId:
      typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    executionId: input.executionId,
    canonicalContextApplied: false as const,
    failureCode: input.code,
    providerInvoked: false as const,
    dependencyArtifactId: depId,
    dependencyVersion: depVer,
    messageSafe: input.message.slice(0, 200),
  };
  pushTrace(ev);
  recordStageSafe(
    input.executionId,
    "cdf_canonical_context",
    "FAILED",
    {
      failureCode: input.code,
      providerInvoked: false,
    },
    input.code,
  );
}

export function emitCanonicalProviderBoundaryTrace(input: {
  prompt: string;
  metadata?: Record<string, unknown>;
  executionId?: string;
  correlationId?: string;
  providerId?: string;
  modelId?: string;
  payloadKeys?: string[];
}): CanonicalGenerationTraceEvent & {
  event: "cdf.generation_context.provider_boundary";
} {
  const meta = input.metadata ?? {};
  const applied = meta[CDF_CANONICAL_CONTEXT_META.applied] === true;
  const sectionsPresent = detectCanonicalSectionsPresent(input.prompt);
  const upstreamRaw = Array.isArray(meta.cdfCanonicalUpstream)
    ? (meta.cdfCanonicalUpstream as CanonicalUpstreamTraceRef[])
    : [];
  const so = meta.structuredOutput;
  const outputContractName =
    so && typeof so === "object" && typeof (so as { name?: unknown }).name === "string"
      ? String((so as { name: string }).name)
      : undefined;

  const ev = {
    event: "cdf.generation_context.provider_boundary" as const,
    ts: new Date().toISOString(),
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId:
      typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    executionId:
      input.executionId ??
      (typeof meta.apiExecutionId === "string"
        ? meta.apiExecutionId
        : typeof meta.executionId === "string"
          ? meta.executionId
          : undefined),
    correlationId: input.correlationId,
    provider: input.providerId,
    model: input.modelId,
    canonicalContextApplied: applied,
    generationContextHash:
      typeof meta[CDF_CANONICAL_CONTEXT_META.hash] === "string"
        ? String(meta[CDF_CANONICAL_CONTEXT_META.hash])
        : undefined,
    promptLength: input.prompt.length,
    sectionsPresent,
    upstreamArtifacts: upstreamRaw.map((u) => ({
      artifactId: u.artifactId,
      version: u.version,
      artifactKey: u.artifactKey,
      role: u.role,
      contentHash: u.contentHash,
    })),
    outputContractName,
    payloadShape: input.payloadKeys ?? ["prompt", "text", "input"],
    canonicalFullDeck: meta[CDF_CANONICAL_CONTEXT_META.fullDeck] === true,
    canonicalModelRequestApplied:
      meta[CDF_CANONICAL_CONTEXT_META.modelRequestApplied] === true ||
      meta.canonicalModelRequestApplied === true ||
      meta.flattenedByProvider === true,
    flattenedByProvider: meta.flattenedByProvider === true,
    messageCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.messageCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.messageCount] as number)
        : typeof meta.messageCount === "number"
          ? meta.messageCount
          : undefined,
    contentPartCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.contentPartCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.contentPartCount] as number)
        : typeof meta.contentPartCount === "number"
          ? meta.contentPartCount
          : undefined,
    structuredPartCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.structuredPartCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.structuredPartCount] as number)
        : typeof meta.structuredPartCount === "number"
          ? meta.structuredPartCount
          : undefined,
    productionSpecPresent:
      meta[CDF_CANONICAL_CONTEXT_META.productionSpecPresent] === true ||
      meta.productionSpecPresent === true ||
      sectionsPresent.productionSpec,
    outputContractPresent:
      meta[CDF_CANONICAL_CONTEXT_META.outputRequirementsPresent] === true ||
      meta.outputContractPresent === true ||
      sectionsPresent.outputContract ||
      sectionsPresent.outputRequirements,
    referenceResolutionApplied:
      meta[CDF_CANONICAL_CONTEXT_META.referenceResolutionApplied] === true ||
      meta.referenceResolutionApplied === true,
    resolvedReferenceCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] as number)
        : typeof meta.resolvedReferenceCount === "number"
          ? meta.resolvedReferenceCount
          : undefined,
    unresolvedReferenceCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount] ===
      "number"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount
          ] as number)
        : typeof meta.unresolvedReferenceCount === "number"
          ? meta.unresolvedReferenceCount
          : undefined,
    ambiguousReferenceCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.ambiguousReferenceCount] ===
      "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.ambiguousReferenceCount] as number)
        : typeof meta.ambiguousReferenceCount === "number"
          ? meta.ambiguousReferenceCount
          : undefined,
    references: Array.isArray(meta.cdfCanonicalReferences)
      ? (meta.cdfCanonicalReferences as Array<{
          referenceType: string;
          targetType: string;
          status: string;
          artifactId?: string;
          version?: number;
          resolutionMethod: string;
          slideNumber?: number;
        }>)
      : undefined,
    workingMemoryApplied:
      meta[CDF_CANONICAL_CONTEXT_META.workingMemoryApplied] === true ||
      meta.workingMemoryApplied === true ||
      sectionsPresent.workingMemory,
    workingMemoryItemCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemoryItemCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.workingMemoryItemCount] as number)
        : typeof meta.workingMemoryItemCount === "number"
          ? meta.workingMemoryItemCount
          : undefined,
    workingMemoryCharacterCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemoryCharacterCount] ===
      "number"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.workingMemoryCharacterCount
          ] as number)
        : typeof meta.workingMemoryCharacterCount === "number"
          ? meta.workingMemoryCharacterCount
          : undefined,
    workingMemoryTurnCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemoryTurnCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.workingMemoryTurnCount] as number)
        : typeof meta.workingMemoryTurnCount === "number"
          ? meta.workingMemoryTurnCount
          : undefined,
    workingMemorySelectionMethod:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemorySelectionMethod] ===
      "string"
        ? String(meta[CDF_CANONICAL_CONTEXT_META.workingMemorySelectionMethod])
        : typeof meta.workingMemorySelectionMethod === "string"
          ? meta.workingMemorySelectionMethod
          : undefined,
    workingMemoryTruncated:
      meta[CDF_CANONICAL_CONTEXT_META.workingMemoryTruncated] === true ||
      meta.workingMemoryTruncated === true,
    workingMemoryDroppedItemCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemoryDroppedItemCount] ===
      "number"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.workingMemoryDroppedItemCount
          ] as number)
        : typeof meta.workingMemoryDroppedItemCount === "number"
          ? meta.workingMemoryDroppedItemCount
          : undefined,
    workingMemorySourceConversationId:
      typeof meta[
        CDF_CANONICAL_CONTEXT_META.workingMemorySourceConversationId
      ] === "string"
        ? String(
            meta[CDF_CANONICAL_CONTEXT_META.workingMemorySourceConversationId],
          )
        : typeof meta.workingMemorySourceConversationId === "string"
          ? meta.workingMemorySourceConversationId
          : undefined,
    artifactContextApplied:
      meta[CDF_CANONICAL_CONTEXT_META.artifactContextApplied] === true ||
      meta.artifactContextApplied === true ||
      (Array.isArray(meta.cdfCanonicalUpstream) &&
        (meta.cdfCanonicalUpstream as unknown[]).length > 0),
    requiredArtifactCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.requiredArtifactCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.requiredArtifactCount] as number)
        : undefined,
    optionalArtifactCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.optionalArtifactCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.optionalArtifactCount] as number)
        : undefined,
    loadedArtifactCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.loadedArtifactCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.loadedArtifactCount] as number)
        : undefined,
    missingArtifactCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.missingArtifactCount] === "number"
        ? (meta[CDF_CANONICAL_CONTEXT_META.missingArtifactCount] as number)
        : undefined,
    skippedOptionalCount:
      typeof meta[CDF_CANONICAL_CONTEXT_META.skippedOptionalArtifactCount] ===
      "number"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.skippedOptionalArtifactCount
          ] as number)
        : undefined,
    artifactContextHash:
      typeof meta[CDF_CANONICAL_CONTEXT_META.artifactContextHash] === "string"
        ? String(meta[CDF_CANONICAL_CONTEXT_META.artifactContextHash])
        : undefined,
    artifactVersions: Array.isArray(meta.cdfArtifactVersions)
      ? (meta.cdfArtifactVersions as string[])
      : undefined,
    loadedFromReferences:
      typeof meta[CDF_CANONICAL_CONTEXT_META.loadedArtifactsFromReferences] ===
      "number"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.loadedArtifactsFromReferences
          ] as number)
        : undefined,
    diagnosticPlanes: buildCdfContextDiagnosticPlanes({
      referenceResolutionApplied:
        meta[CDF_CANONICAL_CONTEXT_META.referenceResolutionApplied] === true ||
        meta.referenceResolutionApplied === true,
      resolvedReferenceCount:
        typeof meta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] ===
        "number"
          ? (meta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] as number)
          : typeof meta.resolvedReferenceCount === "number"
            ? meta.resolvedReferenceCount
            : undefined,
      unresolvedReferenceCount:
        typeof meta[CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount] ===
        "number"
          ? (meta[
              CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount
            ] as number)
          : typeof meta.unresolvedReferenceCount === "number"
            ? meta.unresolvedReferenceCount
            : undefined,
      artifactContextApplied:
        meta[CDF_CANONICAL_CONTEXT_META.artifactContextApplied] === true ||
        meta.artifactContextApplied === true ||
        (Array.isArray(meta.cdfCanonicalUpstream) &&
          (meta.cdfCanonicalUpstream as unknown[]).length > 0),
      requiredArtifactCount:
        typeof meta[CDF_CANONICAL_CONTEXT_META.requiredArtifactCount] ===
        "number"
          ? (meta[CDF_CANONICAL_CONTEXT_META.requiredArtifactCount] as number)
          : undefined,
      loadedArtifactCount:
        typeof meta[CDF_CANONICAL_CONTEXT_META.loadedArtifactCount] === "number"
          ? (meta[CDF_CANONICAL_CONTEXT_META.loadedArtifactCount] as number)
          : undefined,
      artifactVersions: Array.isArray(meta.cdfArtifactVersions)
        ? (meta.cdfArtifactVersions as string[])
        : undefined,
      selectedDirectionPresent:
        meta.cdfSelectedDirectionPresent === true ||
        sectionsPresent.selectedSemanticDirections === true,
      selectedDirectionIdentity:
        typeof meta.cdfSelectedDirectionIdentity === "string"
          ? meta.cdfSelectedDirectionIdentity
          : undefined,
    }),
  };
  pushTrace(ev);
  recordStageSafe(ev.executionId, "cdf_provider_boundary", "COMPLETED", {
    generationContextHash: ev.generationContextHash,
    canonicalContextApplied: ev.canonicalContextApplied,
    promptLength: ev.promptLength,
    sectionsPresent: ev.sectionsPresent,
    provider: ev.provider,
    model: ev.model,
    upstreamCount: ev.upstreamArtifacts.length,
  });
  return ev;
}

/** Assert compilation and provider-boundary traces agree on correlation fields. */
export function assertCanonicalTraceConsistency(input: {
  compiled: Extract<
    CanonicalGenerationTraceEvent,
    { event: "cdf.generation_context.compiled" }
  >;
  boundary: Extract<
    CanonicalGenerationTraceEvent,
    { event: "cdf.generation_context.provider_boundary" }
  >;
}): void {
  if (
    input.compiled.executionId &&
    input.boundary.executionId &&
    input.compiled.executionId !== input.boundary.executionId
  ) {
    throw new Error("canonical trace executionId mismatch");
  }
  if (input.compiled.cdfSessionId !== input.boundary.cdfSessionId) {
    throw new Error("canonical trace cdfSessionId mismatch");
  }
  if (input.compiled.cdfPhaseId !== input.boundary.cdfPhaseId) {
    throw new Error("canonical trace cdfPhaseId mismatch");
  }
  if (input.compiled.generationContextHash !== input.boundary.generationContextHash) {
    throw new Error("canonical trace generationContextHash mismatch");
  }
  if (input.compiled.canonicalContextApplied !== input.boundary.canonicalContextApplied) {
    throw new Error("canonical trace applied mismatch");
  }
  const a = input.compiled.upstreamArtifacts
    .map((u) => `${u.artifactId}@${u.version}`)
    .sort()
    .join(",");
  const b = input.boundary.upstreamArtifacts
    .map((u) => `${u.artifactId}@${u.version}`)
    .sort()
    .join(",");
  if (a !== b) {
    throw new Error(`canonical trace upstream mismatch: ${a} vs ${b}`);
  }
}

/**
 * Scoped completeness check for canonical CDF generation proof traces.
 * Not a generic AI observability framework.
 */
export function assertCanonicalTraceCompleteness(input: {
  compiled?: CanonicalGenerationTraceEvent;
  boundary?: CanonicalGenerationTraceEvent;
  requireApplied?: boolean;
}): void {
  const compiled = input.compiled;
  const boundary = input.boundary;
  if (!compiled || compiled.event !== "cdf.generation_context.compiled") {
    throw new Error("missing cdf.generation_context.compiled trace");
  }
  if (!boundary || boundary.event !== "cdf.generation_context.provider_boundary") {
    throw new Error("missing cdf.generation_context.provider_boundary trace");
  }
  if (input.requireApplied !== false) {
    if (!compiled.canonicalContextApplied || !boundary.canonicalContextApplied) {
      throw new Error("expected canonicalContextApplied=true");
    }
  }
  if (!compiled.generationContextHash) {
    throw new Error("missing contextHash on compiled trace");
  }
  if (!compiled.cdfPhaseId || !boundary.cdfPhaseId) {
    throw new Error("missing phase on canonical traces");
  }
  if (!compiled.executionId && !boundary.executionId) {
    throw new Error("missing execution id on canonical traces");
  }
  if (!compiled.upstreamArtifacts?.length) {
    throw new Error("missing upstream refs on compiled trace");
  }
  if (!compiled.sectionsPresent || !boundary.sectionsPresent) {
    throw new Error("missing section presence metadata");
  }
  if (!boundary.provider || !boundary.model) {
    throw new Error("missing provider/model on provider-boundary trace");
  }
}
