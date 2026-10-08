/**
 * Apply canonical generation context on the create path (backend-authoritative).
 */

import {
  CANONICAL_MODEL_REQUEST_META_KEY,
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  countCanonicalContentParts,
  type CanonicalModelRequest,
} from "../../ai/canonical-model-request";
import { loadPersistedConversationalMessages } from "../../ai/conversational-runtime/conversation-ledger";
import { getCdfSession } from "../session-store";
import { resolveGenerationContext } from "../context-resolver/resolve";
import { contextProvenanceMetadata } from "../context-resolver/prompt-adapter";
import { compileCanonicalGenerationRequest } from "./compile";
import {
  assembleCanonicalModelRequest,
  detectCanonicalSectionsFromModelRequest,
} from "./compile-model-request";
import {
  CDF_CANONICAL_CONTEXT_META,
  hasCdfSessionPhaseMetadata,
  isCdfCanonicalGenerationContextEnabled,
} from "./flag";
import {
  resolveCanonicalGenerationEligibility,
} from "../../ai/production-hardening/eligibility";
import { resolveCdfPhaseExecutionContract } from "../canonical";
import { emitCanonicalRolloutDecisionTrace } from "../../ai/production-hardening/rollout-observability";
import { summarizeUpstreamForObservability } from "./hash";
import { buildProviderGenerationIntentDiagnostics } from "./provider-intent-diagnostics";
import {
  buildArtifactContextObservability,
  rehydrateReferencedArtifacts,
  resolveArtifactContextForGeneration,
  summarizeArtifactContextForTrace,
} from "./resolve-artifact-context";
import { resolveCanonicalAssemblyEnrichments } from "./resolve-assembly-enrichments";
import { compileDeliverableComposition } from "./compile-deliverable-composition";
import { resolveDeliverableCompositionForPhase } from "./resolve-deliverable-composition";
import {
  assertRequiredCommunicationValuesResolved,
  assertRequiredOnAssetCompositionInCmr,
  contractRequiresOnAssetCommunication,
  qualifyProductionSpecForRequiredComposition,
} from "./composition-authority";
import { resolveCanonicalConversationalInstructionDetailed } from "../../ai/conversational-runtime/resolve-instruction";
import {
  inspectBrandIdentityAuthority,
  resolveCanonicalBrandContextFromMetadata,
  resolveCanonicalProductGroundingFromMetadata,
} from "./resolve-brand-product-context";
import {
  resolveCanonicalGenerationReferences,
  summarizeGenerationReferencesForTrace,
} from "./resolve-references";
import { resolveSelectedSemanticChoices, artifactDataLooksLikeChoiceSet, selectSemanticChoiceForComposition } from "./resolve-selected-choice";
import {
  assertUpstreamSemanticProjectionForOnAsset,
  resolveAllUpstreamArtifactContexts,
  upstreamContinuityDiagnostics,
} from "./resolve-upstream-artifact-context";
import { compositionContractOnAssetIntegrity } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  conversationMessagesFromMetadata,
  resolveCanonicalWorkingMemory,
  summarizeWorkingMemoryForTrace,
} from "./resolve-working-memory";
import {
  resolveWorkingMemoryConversationHandoff,
  workingMemoryHandoffObservability,
} from "./resolve-conversation-handoff";
import {
  projectCanonicalMultimodalForProviders,
  resolveCanonicalMultimodalContext,
  summarizeMultimodalForTrace,
} from "./resolve-multimodal-context";
import { extractVaultAssetIdFromArtifactData } from "./canonical-visual-bytes";
import {
  emitCanonicalContextCompiledTrace,
  emitCanonicalContextFailedTrace,
  emitCanonicalContextSkippedTrace,
} from "./trace";
import type {
  ApplyCanonicalGenerationContextInput,
  CanonicalGenerationRequest,
  GenerationContextErrorCode,
} from "./types";

function metaString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = metadata[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export type CanonicalContextSkip = {
  ok: true;
  skipped: true;
  prompt: string;
  metadata: Record<string, unknown>;
};

export type CanonicalContextApplied = {
  ok: true;
  skipped: false;
  request: CanonicalGenerationRequest;
  /** Provider-neutral semantic request (Phase 4 SoT). Not a flattened prompt. */
  modelRequest: CanonicalModelRequest;
  /**
   * Placeholder for DirectExecutionRequest.rawPrompt when modelRequest is set.
   * Flattening happens only in provider compatibility — not here.
   */
  prompt: string;
  metadata: Record<string, unknown>;
};

export type CanonicalContextApplyResult =
  | CanonicalContextSkip
  | CanonicalContextApplied
  | {
      ok: false;
      code: GenerationContextErrorCode;
      message: string;
      details?: Record<string, unknown>;
    };

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

/**
 * When flag OFF or not a CDF session/phase create → skipped (prompt unchanged).
 * When flag ON and CDF create → resolve, rehydrate exact versions, compile
 * CanonicalModelRequest (structured). Does not flatten to a giant prompt.
 * Required dependency failures return ok:false (no silent note fallback).
 */
export function tryApplyCanonicalGenerationContext(
  input: ApplyCanonicalGenerationContextInput,
): CanonicalContextApplyResult {
  const baseMeta = { ...input.metadata };
  const executionId = executionIdFromMeta(baseMeta);
  const hasCdfPhase = hasCdfSessionPhaseMetadata(baseMeta);
  const stampedCanonical =
    typeof baseMeta.cdfExecutionStrategy === "string" &&
    baseMeta.cdfExecutionStrategy === "canonical";
  // Authoritative: registry contract wins even if stamp omitted.
  let contractCanonical = stampedCanonical;
  if (!contractCanonical && hasCdfPhase) {
    const svc =
      metaString(baseMeta, "cdfServiceId") || metaString(baseMeta, "serviceId");
    const phase = metaString(baseMeta, "cdfPhaseId");
    if (svc && phase) {
      const contract = resolveCdfPhaseExecutionContract({
        serviceId: svc,
        phaseId: phase,
      });
      contractCanonical = contract?.executionStrategy === "canonical";
      if (contractCanonical && !baseMeta.cdfExecutionStrategy) {
        baseMeta.cdfExecutionStrategy = "canonical";
      }
    }
  }
  const mustStayCanonical = hasCdfPhase && contractCanonical;
  const flagOn = isCdfCanonicalGenerationContextEnabled();

  // Contract wins over strangler flag: canonical strategy phases MUST resolve
  // generation context. The env flag only gates non-canonical / exploratory traffic.
  if (!flagOn && !mustStayCanonical) {
    emitCanonicalContextSkippedTrace({
      reason: "flag_off",
      metadata: baseMeta,
      executionId,
    });
    return {
      ok: true,
      skipped: true,
      prompt: input.prompt,
      metadata: {
        ...baseMeta,
        [CDF_CANONICAL_CONTEXT_META.enabled]: false,
        [CDF_CANONICAL_CONTEXT_META.applied]: false,
        [CDF_CANONICAL_CONTEXT_META.fallbackUsed]: false,
        cdfCanonicalRolloutReason: "generation_flag_off",
      },
    };
  }

  // Progressive eligibility. Contract-canonical phases NEVER consult Class-A /
  // stage allowlists as an execution gate — strategy===canonical is sufficient.
  if (mustStayCanonical) {
    if (!flagOn) {
      baseMeta.cdfCanonicalContextContractForced = true;
      baseMeta.cdfCanonicalRolloutReason = "contract_canonical_overrides_flag";
    } else {
      const eligibility = resolveCanonicalGenerationEligibility({
        organizationId: input.organizationId,
        projectId: input.projectId,
        serviceId:
          (typeof baseMeta.cdfServiceId === "string" && baseMeta.cdfServiceId) ||
          (typeof baseMeta.serviceId === "string" && baseMeta.serviceId) ||
          undefined,
        cdfSessionId:
          typeof baseMeta.cdfSessionId === "string"
            ? baseMeta.cdfSessionId
            : undefined,
        cdfPhaseId:
          typeof baseMeta.cdfPhaseId === "string"
            ? baseMeta.cdfPhaseId
            : undefined,
        executionId,
        metadata: baseMeta,
      });
      emitCanonicalRolloutDecisionTrace(eligibility, executionId);
      baseMeta.cdfCanonicalContextContractForced = true;
      baseMeta.cdfCanonicalRolloutReason =
        "contract_canonical_overrides_rollout_eligibility";
      baseMeta.cdfCanonicalRolloutStage = eligibility.stage;
      baseMeta.cdfCanonicalRolloutObservationalEligible = eligibility.eligible;
      baseMeta.cdfCanonicalRolloutObservationalReason = eligibility.reason;
    }
    return applyEnabled({ ...input, metadata: baseMeta });
  }

  const eligibility = resolveCanonicalGenerationEligibility({
    organizationId: input.organizationId,
    projectId: input.projectId,
    serviceId:
      (typeof baseMeta.cdfServiceId === "string" && baseMeta.cdfServiceId) ||
      (typeof baseMeta.serviceId === "string" && baseMeta.serviceId) ||
      undefined,
    cdfSessionId:
      typeof baseMeta.cdfSessionId === "string"
        ? baseMeta.cdfSessionId
        : undefined,
    cdfPhaseId:
      typeof baseMeta.cdfPhaseId === "string" ? baseMeta.cdfPhaseId : undefined,
    executionId,
    metadata: baseMeta,
  });
  emitCanonicalRolloutDecisionTrace(eligibility, executionId);

  if (!eligibility.eligible) {
    emitCanonicalContextSkippedTrace({
      reason: "other",
      metadata: baseMeta,
      executionId,
    });
    if (hasCdfPhase && eligibility.failClosed) {
      return fail(
        input,
        "CONTEXT_RESOLUTION_FAILED",
        `Canonical CDF generation blocked: ${eligibility.reason}`,
        {
          stage: eligibility.stage,
          reason: eligibility.reason,
          failClosed: true,
        },
      );
    }
    return {
      ok: true,
      skipped: true,
      prompt: input.prompt,
      metadata: {
        ...baseMeta,
        [CDF_CANONICAL_CONTEXT_META.enabled]: true,
        [CDF_CANONICAL_CONTEXT_META.applied]: false,
        [CDF_CANONICAL_CONTEXT_META.fallbackUsed]: false,
        cdfCanonicalRolloutStage: eligibility.stage,
        cdfCanonicalRolloutPath: eligibility.path,
        cdfCanonicalRolloutReason: eligibility.reason,
        cdfCanonicalRolloutFailClosed: eligibility.failClosed,
      },
    };
  }

  if (!hasCdfPhase) {
    emitCanonicalContextSkippedTrace({
      reason: "not_cdf_phase",
      metadata: baseMeta,
      executionId,
    });
    return {
      ok: true,
      skipped: true,
      prompt: input.prompt,
      metadata: {
        ...baseMeta,
        [CDF_CANONICAL_CONTEXT_META.enabled]: true,
        [CDF_CANONICAL_CONTEXT_META.applied]: false,
        [CDF_CANONICAL_CONTEXT_META.fallbackUsed]: false,
      },
    };
  }

  return applyEnabled(input);
}

function fail(
  input: ApplyCanonicalGenerationContextInput,
  code: GenerationContextErrorCode,
  message: string,
  details?: Record<string, unknown>,
): CanonicalContextApplyResult {
  emitCanonicalContextFailedTrace({
    code,
    message,
    metadata: input.metadata,
    executionId: executionIdFromMeta(input.metadata),
    details,
  });
  return { ok: false, code, message, details };
}

function applyEnabled(
  input: ApplyCanonicalGenerationContextInput,
): CanonicalContextApplyResult {
  const metadata = { ...input.metadata };
  const sessionId = metaString(metadata, "cdfSessionId")!;
  const phaseId = metaString(metadata, "cdfPhaseId")!;
  const executionId = executionIdFromMeta(metadata);

  const session = getCdfSession(sessionId);
  if (!session) {
    return fail(input, "CONTEXT_RESOLUTION_FAILED", `CDF session not found: ${sessionId}`, {
      sessionId,
      phaseId,
    });
  }

  const serviceId =
    metaString(metadata, "cdfServiceId") ??
    metaString(metadata, "service") ??
    session.serviceId ??
    "unknown";

  // Single instruction authority — never promote CTI effectiveInstruction.
  const instructionResolution = resolveCanonicalConversationalInstructionDetailed(
    metadata,
  );
  const explicitFromInput = input.conversationalInstruction?.trim() || "";
  const explicitCurrent =
    explicitFromInput || instructionResolution.instruction || "";

  const phasePrompt = input.prompt.trim();
  const currentUserInstruction =
    explicitCurrent && explicitCurrent !== phasePrompt
      ? explicitCurrent
      : explicitCurrent || phasePrompt;
  const currentUserInstructionSource = explicitFromInput
    ? ("explicit_input" as const)
    : instructionResolution.source !== "none"
      ? instructionResolution.source
      : ("phase_prompt" as const);
  const ctiEffective =
    typeof metadata.conversationalEffectiveInstruction === "string"
      ? metadata.conversationalEffectiveInstruction.trim()
      : "";
  const ctiEffectivePresent = Boolean(ctiEffective);

  const resolvedResult = resolveGenerationContext({
    sessionId,
    serviceId: session.serviceId || serviceId,
    phaseId,
    currentUserInstruction,
    expectedSessionVersion: session.sessionVersion,
    refinePrompt:
      typeof metadata.refinePrompt === "string"
        ? metadata.refinePrompt
        : session.lastRefinePrompt,
  });

  if (!resolvedResult.ok) {
    return fail(input, "CONTEXT_RESOLUTION_FAILED", resolvedResult.message, {
      status: resolvedResult.status,
      code: resolvedResult.code,
    });
  }

  const resolved = resolvedResult.context;
  if (
    resolved.status === "blocked" ||
    resolved.status === "invalid" ||
    resolved.status === "stale"
  ) {
    return fail(
      input,
      "CONTEXT_RESOLUTION_FAILED",
      `Resolved generation context status=${resolved.status}`,
      { status: resolved.status, warnings: resolved.warnings },
    );
  }

  // Phase 8 — exact ArtifactVersion rehydration (extends Phase 2 loader).
  const artifactCtx = resolveArtifactContextForGeneration({
    session,
    serviceId: resolved.serviceId,
    phaseId: resolved.phaseId,
    organizationId: input.organizationId ?? session.organizationId,
    projectId: input.projectId ?? session.projectId,
  });

  if (!artifactCtx.ok) {
    return fail(input, artifactCtx.code, artifactCtx.message, artifactCtx.details);
  }

  let upstream = artifactCtx.upstream;
  const loader = artifactCtx.loader;

  // Declarative: assembled-deck phases declare presentationArtifactFamily=presentation.deck
  // — never branch on phaseId string equality.
  const { resolveCdfPhaseDefinition } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../canonical") as typeof import("../canonical");
  const phaseDef = resolveCdfPhaseDefinition(
    session.serviceId || serviceId,
    resolved.phaseId,
  );
  const requiresAssembledDeck =
    phaseDef?.presentationArtifactFamily === "presentation.deck";

  if (requiresAssembledDeck) {
    const hasSlideContent = upstream.some(
      (u) =>
        u.artifactKey === "presentation.slide-content" ||
        u.phaseId === "slide-content",
    );
    const hasDesignSystem = upstream.some(
      (u) =>
        u.artifactKey === "presentation.design-system" ||
        u.role === "design_reference",
    );
    if (!hasSlideContent) {
      return fail(
        input,
        "DEPENDENCY_NOT_SATISFIED",
        "Assembled-deck phase requires exact presentation.slide-content ArtifactVersion",
      );
    }
    if (!hasDesignSystem) {
      return fail(
        input,
        "DEPENDENCY_NOT_SATISFIED",
        "Assembled-deck phase requires exact presentation.design-system ArtifactVersion",
      );
    }
  }

  // Phase 6 — deterministic references BEFORE CMR assembly (instruction unchanged).
  const referenceResolution = resolveCanonicalGenerationReferences({
    instruction: currentUserInstruction,
    session,
    phaseId: resolved.phaseId,
    upstream,
    metadata,
    organizationId: input.organizationId ?? session.organizationId,
    projectId: input.projectId ?? session.projectId,
  });
  const referenceTrace = summarizeGenerationReferencesForTrace(
    referenceResolution,
  );

  // Phase 8 + Phase 6 — ensure exact referenced versions are loaded when authorized.
  const rehydrated = rehydrateReferencedArtifacts({
    session,
    upstream,
    referenceResolution,
    loader,
    organizationId: input.organizationId ?? session.organizationId,
    projectId: input.projectId ?? session.projectId,
  });
  if (!rehydrated.ok) {
    return fail(input, rehydrated.code, rehydrated.message, rehydrated.details);
  }
  upstream = rehydrated.upstream;

  const artifactObs = buildArtifactContextObservability({
    upstream,
    skippedOptional: [
      ...artifactCtx.skippedOptional,
      ...rehydrated.skipped,
    ],
    loadedFromReferences: rehydrated.loadedFromReferences,
    loaderCacheSize: loader.cacheSize(),
  });
  const artifactTrace = summarizeArtifactContextForTrace(artifactObs);

  // Phase 7 — bounded working memory from already-loaded conversation turns.
  const handoff = resolveWorkingMemoryConversationHandoff(metadata);
  const fromInputOrMeta =
    input.conversationMessages?.length
      ? input.conversationMessages
      : conversationMessagesFromMetadata(metadata);
  // Phase 13A — when callers did not inject messages, load from persisted ledger
  // (Collaboration OS adapter / harness). Never invents conversation identity.
  const conversationMessages =
    fromInputOrMeta.length > 0
      ? fromInputOrMeta
      : loadPersistedConversationalMessages({
          conversationId: handoff.conversationId,
          channelId: handoff.channelId,
        });
  const workingMemory = resolveCanonicalWorkingMemory({
    messages: conversationMessages,
    currentUserInstruction,
    conversationId: handoff.conversationId,
    channelId: handoff.channelId,
    referenceResolution,
  });
  const workingMemoryTrace = summarizeWorkingMemoryForTrace(workingMemory);
  const handoffObs = workingMemoryHandoffObservability({
    handoff,
    messageCountLoaded: conversationMessages.length,
  });

  // Phase 9 — multimodal context from authorized metadata + conversation attachments.
  const multimodalContext = resolveCanonicalMultimodalContext({
    metadata,
    conversationMessages,
    organizationId: input.organizationId ?? session.organizationId,
    referenceResolution,
  });
  const multimodalProjection = projectCanonicalMultimodalForProviders({
    context: multimodalContext,
    metadata,
  });
  const multimodalTrace = summarizeMultimodalForTrace(multimodalContext);

  // Phase 9A — compatibility delivery for DirectExecutionEngine only.
  // Semantic multimodal source of truth is CMR.multimodal_context (provider mappers
  // read CMR). metadata.assets is derived FROM canonical items when present so
  // legacy payload copy stays consistent — not an independent semantic assembly.
  const derivedFromCanonical = multimodalContext.items
    .filter(
      (i) =>
        i.providerDelivery &&
        (i.providerDelivery.url || i.providerDelivery.storageRef),
    )
    .map((i) => ({
      assetId: i.assetId,
      mimeType: i.providerDelivery!.mimeType ?? i.mimeType,
      url: i.providerDelivery!.url,
      storageRef: i.providerDelivery!.storageRef,
      organizationId: i.organizationId,
      filename: i.filename,
      ...(i.semanticReferenceRole
        ? { semanticReferenceRole: i.semanticReferenceRole }
        : {}),
      ...(i.referenceRoleResolutionSource
        ? { referenceRoleResolutionSource: i.referenceRoleResolutionSource }
        : {}),
      ...(i.semanticReferenceRole === "identity_mark"
        ? { brandAssetRole: "logo" }
        : {}),
    }));
  const nextAssets =
    derivedFromCanonical.length > 0
      ? derivedFromCanonical
      : Array.isArray(metadata.assets)
        ? [...(metadata.assets as unknown[])]
        : [];

  // Semantic selection resolution: parent X@V + selectedRouteIndex → choice object.
  // Only require phases whose loaded upstream is a selectable choice set.
  const requirePhaseIds = upstream
    .filter(
      (u) =>
        (u.sessionRole === "selected" || u.role === "selected_reference") &&
        artifactDataLooksLikeChoiceSet(u.data),
    )
    .map((u) => u.phaseId);

  const semanticSelection = resolveSelectedSemanticChoices({
    selections: resolved.selections,
    upstream,
    failClosed: true,
    requirePhaseIds,
  });
  if (!semanticSelection.ok) {
    return fail(
      input,
      "CDF_SELECTION_REFERENCE_UNRESOLVED",
      semanticSelection.message,
      semanticSelection.details,
    );
  }

  // Required choice-set parents must have a resolved semantic slice.
  for (const phaseId of requirePhaseIds) {
    const sel = resolved.selections.find((s) => s.phaseId === phaseId);
    if (!sel || sel.routeIndex == null || !Number.isInteger(sel.routeIndex)) {
      return fail(
        input,
        "CDF_SELECTION_REFERENCE_UNRESOLVED",
        `Required selectable parent for phase "${phaseId}" has no selectedRouteIndex`,
        { phaseId },
      );
    }
    if (!semanticSelection.choices.some((c) => c.phaseId === phaseId)) {
      return fail(
        input,
        "CDF_SELECTION_REFERENCE_UNRESOLVED",
        `Required selectable parent for phase "${phaseId}" did not resolve to a semantic choice`,
        { phaseId, routeIndex: sel.routeIndex },
      );
    }
  }

  // Required option references must resolve; fail closed when they do not.
  const requiredOptionUnresolved = (
    referenceResolution.references ?? []
  ).filter(
    (r) =>
      r.referenceType === "option" &&
      (r.status === "unresolved" || r.status === "ambiguous"),
  );
  const resolvedOptionNumbers = new Set(
    semanticSelection.choices.map((c) => c.optionNumber),
  );
  const optionRefsSatisfiedBySemantic = requiredOptionUnresolved.filter(
    (r) => r.optionIndex != null && resolvedOptionNumbers.has(r.optionIndex),
  );
  const stillUnresolved = requiredOptionUnresolved.filter((r) => {
    const n = r.optionIndex;
    return n == null || !resolvedOptionNumbers.has(n);
  });
  if (stillUnresolved.length > 0) {
    return fail(
      input,
      "CDF_SELECTION_REFERENCE_UNRESOLVED",
      "Required selected option reference could not be resolved to a parent ArtifactVersion choice",
      {
        unresolved: stillUnresolved.map((r) => ({
          sourceText: r.sourceText,
          status: r.status,
          referenceType: r.referenceType,
          targetType: r.targetType,
          optionIndex: r.optionIndex,
        })),
      },
    );
  }

  // When semantic selection covers option refs, rewrite reference resolution
  // so observability reflects authority (not stale unresolved option labels).
  let effectiveReferenceResolution = referenceResolution;
  if (optionRefsSatisfiedBySemantic.length > 0) {
    const rewritten = referenceResolution.references.map((r) => {
      if (
        r.referenceType === "option" &&
        (r.status === "unresolved" || r.status === "ambiguous") &&
        r.optionIndex != null &&
        resolvedOptionNumbers.has(r.optionIndex)
      ) {
        const hit = semanticSelection.choices.find(
          (c) => c.optionNumber === r.optionIndex,
        )!;
        return {
          ...r,
          status: "exact" as const,
          targetType: "option" as const,
          resolutionMethod: "selected_artifact" as const,
          artifactId: hit.artifactId,
          version: hit.version,
          artifactKey: hit.artifactKey,
          phaseId: hit.phaseId,
          targetId: `${hit.artifactId}@${hit.version}#option:${r.optionIndex}`,
          provenance: Object.freeze([
            ...r.provenance,
            "semantic_selection_resolution",
            `choice_array:${hit.choiceArrayKey}`,
          ]),
        };
      }
      return r;
    });
    const unresolvedCount = rewritten.filter(
      (r) => r.status === "unresolved",
    ).length;
    const ambiguousCount = rewritten.filter(
      (r) => r.status === "ambiguous",
    ).length;
    const resolvedCount = rewritten.filter(
      (r) => r.status === "exact" || r.status === "deterministic",
    ).length;
    effectiveReferenceResolution = {
      ...referenceResolution,
      references: Object.freeze(rewritten),
      unresolvedCount,
      ambiguousCount,
      resolvedCount,
    };
  }

  // When indexed selections exist against choice-set parents, require semantic choices.
  const indexedChoiceSelections = resolved.selections.filter(
    (s) =>
      s.routeIndex != null &&
      Number.isInteger(s.routeIndex) &&
      requirePhaseIds.includes(s.phaseId),
  );
  if (
    indexedChoiceSelections.length > 0 &&
    semanticSelection.choices.length === 0
  ) {
    return fail(
      input,
      "CDF_SELECTION_REFERENCE_UNRESOLVED",
      "Session selection indexes present but no semantic choice resolved from upstream artifacts",
      {
        selections: indexedChoiceSelections.map((s) => ({
          phaseId: s.phaseId,
          routeIndex: s.routeIndex,
          label: s.label,
        })),
      },
    );
  }

  const intentTags = Array.isArray(metadata.continuityIntentTags)
    ? metadata.continuityIntentTags.filter(
        (t): t is string => typeof t === "string" && Boolean(t.trim()),
      )
    : undefined;
  const brandContext = resolveCanonicalBrandContextFromMetadata(metadata, {
    generationModality: resolved.phaseContext.generationModality,
    uxType: resolved.phaseContext.uxType,
    intentTags,
  });
  const brandIdentityDiagnostics = inspectBrandIdentityAuthority(metadata);
  const productGrounding =
    resolveCanonicalProductGroundingFromMetadata(metadata);

  const generationContinuations = session.generationContinuations ?? [];
  const metaContinuation = (() => {
    const stamped = metadata.cdfGenerationContinuation;
    if (
      stamped &&
      typeof stamped === "object" &&
      !Array.isArray(stamped) &&
      (stamped as { selectionKind?: unknown }).selectionKind ===
        "generation_continuation" &&
      typeof (stamped as { visualArtifactId?: unknown }).visualArtifactId ===
        "string"
    ) {
      return stamped as CanonicalGenerationRequest["userSelectedGenerationReference"];
    }
    const visualArtifactId =
      typeof metadata.cdfContinuationVisualArtifactId === "string"
        ? metadata.cdfContinuationVisualArtifactId.trim()
        : "";
    const executionId =
      typeof metadata.cdfContinuationExecutionId === "string"
        ? metadata.cdfContinuationExecutionId.trim()
        : "";
    if (!visualArtifactId || !executionId) return undefined;
    return {
      selectionKind: "generation_continuation" as const,
      sourcePhaseId: "unknown",
      executionId,
      visualArtifactId,
      isDiagnosticRaw:
        metadata.cdfContinuationIsDiagnosticRaw === true ||
        visualArtifactId.startsWith("art_"),
      ...(typeof metadata.cdfContinuationFanoutTargetId === "string"
        ? {
            generationFanoutTargetId:
              metadata.cdfContinuationFanoutTargetId.trim(),
          }
        : {}),
    };
  })();
  const userSelectedGenerationReference =
    metadata.cdfRefineSource === true && metaContinuation
      ? metaContinuation
      : generationContinuations.length > 0
        ? generationContinuations[generationContinuations.length - 1]
        : metaContinuation;

  // Visual continuity fail-closed: semantic direction alone is insufficient when
  // the user authorized an exact upstream visual for a visual emission phase.
  const modality = resolved.phaseContext.generationModality;
  const isVisualEmission =
    modality === "image" ||
    modality === "video" ||
    modality === "hybrid";
  if (userSelectedGenerationReference && isVisualEmission) {
    const visualId = userSelectedGenerationReference.visualArtifactId;
    const matchingItems = multimodalContext.items.filter((item) => {
      if (item.modality !== "image") return false;
      const idMatch =
        item.assetId === visualId ||
        item.relationshipLabel === "user_selected_generation_reference";
      const hasBytes = Boolean(
        item.providerDelivery &&
          (item.providerDelivery.url || item.providerDelivery.storageRef),
      );
      return idMatch && hasBytes;
    });
    // Prefer exact asset id match; relationship label alone is acceptable only
    // when it is the sole continuation stamp (never a different leaf).
    const exactMatch = matchingItems.some((i) => i.assetId === visualId);
    const relationshipOnly =
      !exactMatch &&
      matchingItems.some(
        (i) => i.relationshipLabel === "user_selected_generation_reference",
      );
    if (!exactMatch && !relationshipOnly) {
      console.info(
        JSON.stringify({
          scope: "cdf.generation_context",
          event: "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED",
          phaseId: resolved.phaseId,
          visualArtifactId: visualId,
          executionId: userSelectedGenerationReference.executionId,
          generationFanoutTargetId:
            userSelectedGenerationReference.generationFanoutTargetId ?? null,
          multimodalImageCount: multimodalContext.imageCount,
          resolverStatus: "unresolved",
          byteAvailability: false,
        }),
      );
      return fail(
        input,
        "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED",
        "Required upstream selected visual could not be resolved into multimodal image bytes — refusing to invent a replacement visual",
        {
          visualArtifactId: visualId,
          executionId: userSelectedGenerationReference.executionId,
          generationFanoutTargetId:
            userSelectedGenerationReference.generationFanoutTargetId ?? null,
          sourcePhaseId: userSelectedGenerationReference.sourcePhaseId,
          phaseId: resolved.phaseId,
          multimodalImageCount: multimodalContext.imageCount,
        },
      );
    }
    console.info(
      JSON.stringify({
        scope: "cdf.generation_context",
        event: "UPSTREAM_SELECTED_VISUAL",
        referenceRole: "subject_reference",
        authority: "authoritative",
        phaseId: resolved.phaseId,
        visualArtifactId: visualId,
        executionId: userSelectedGenerationReference.executionId,
        generationFanoutTargetId:
          userSelectedGenerationReference.generationFanoutTargetId ?? null,
        resolved: true,
        bytes: true,
        exactAssetIdMatch: exactMatch,
      }),
    );
  }

  // Approved/selected dependency visual handoff: exact X@V with Vault media must
  // be present as multimodal image bytes for visual emission (not structured-only).
  if (isVisualEmission) {
    const requiredVisualUpstream = upstream.filter(
      (u) => u.required && Boolean(extractVaultAssetIdFromArtifactData(u.data)),
    );
    if (requiredVisualUpstream.length > 0) {
      const hasUpstreamVisualBytes = multimodalContext.items.some((item) => {
        if (item.modality !== "image") return false;
        const hasBytes = Boolean(
          item.providerDelivery &&
            (item.providerDelivery.url || item.providerDelivery.storageRef),
        );
        if (!hasBytes) return false;
        return requiredVisualUpstream.some(
          (u) =>
            item.assetId === u.artifactId ||
            item.relationshipLabel === "cdf_upstream_visual_artifact",
        );
      });
      // Also accept assets stamped before multimodal projection.
      const assets = Array.isArray(metadata.assets) ? metadata.assets : [];
      const assetsHaveUpstream = assets.some((a) => {
        const rec =
          a && typeof a === "object" && !Array.isArray(a)
            ? (a as Record<string, unknown>)
            : undefined;
        if (!rec) return false;
        const hasBytes = Boolean(
          (typeof rec.url === "string" && rec.url.trim()) ||
            (typeof rec.storageRef === "string" && rec.storageRef.trim()),
        );
        if (!hasBytes) return false;
        return requiredVisualUpstream.some(
          (u) =>
            rec.assetId === u.artifactId ||
            rec.cdfUpstreamArtifactId === u.artifactId ||
            rec.relationshipLabel === "cdf_upstream_visual_artifact",
        );
      });
      if (!hasUpstreamVisualBytes && !assetsHaveUpstream) {
        const first = requiredVisualUpstream[0]!;
        return fail(
          input,
          "CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE",
          `Required upstream visual ArtifactVersion ${first.artifactId}@${first.version} is declared but not materialized as provider-usable media for phase "${resolved.phaseId}"`,
          {
            artifactId: first.artifactId,
            artifactVersion: first.version,
            artifactKey: first.artifactKey,
            sourcePhase: first.phaseId,
            targetPhase: resolved.phaseId,
            requiredRepresentation: "image_asset",
            actualRepresentation: "structured_only",
            resolverStage: "multimodal_attach",
          },
        );
      }
    }
  }

  const request = compileCanonicalGenerationRequest({
    resolved,
    upstream,
    currentUserInstruction,
    canonicalFullDeck: requiresAssembledDeck,
    referenceResolution: effectiveReferenceResolution,
    workingMemory,
    multimodalContext,
    selectedSemanticChoices: semanticSelection.choices,
    ...(userSelectedGenerationReference
      ? { userSelectedGenerationReference }
      : {}),
    brandContext,
    productGrounding,
    ...(ctiEffectivePresent &&
    ctiEffective &&
    ctiEffective !== currentUserInstruction
      ? {
          conversationalInterpretation: {
            text: ctiEffective,
            role: "advisory_cti_interpretation" as const,
          },
        }
      : {}),
  });

  // Phase 5 — assemble Production Spec + output requirements into CMR (not post-flatten).
  const compositionResolution = resolveDeliverableCompositionForPhase({
    serviceId,
    phaseId: resolved.phaseId,
    service:
      typeof productGrounding?.service === "string"
        ? productGrounding.service
        : typeof metadata.service === "string"
          ? metadata.service
          : null,
    subtype:
      typeof productGrounding?.subtype === "string"
        ? productGrounding.subtype
        : typeof metadata.subtype === "string"
          ? metadata.subtype
          : null,
    productKey:
      typeof metadata.productKey === "string"
        ? metadata.productKey
        : typeof metadata.productPath === "string"
          ? metadata.productPath
          : null,
  });
  if (compositionResolution.required && compositionResolution.contract == null) {
    return fail(
      input,
      "CDF_DELIVERABLE_COMPOSITION_MISSING",
      "Visual emission phase lacks an authoritative deliverable composition contract",
      {
        serviceId,
        phaseId: resolved.phaseId,
        deliverableKind: compositionResolution.deliverableKind,
      },
    );
  }

  if (compositionResolution.contract) {
    const onAssetIntegrity = compositionContractOnAssetIntegrity(
      compositionResolution.contract,
    );
    if (!onAssetIntegrity.ok) {
      return fail(
        input,
        "COMPOSITION_ON_ASSET_RENDERED_COMMUNICATION_UNDECLARED",
        onAssetIntegrity.message,
        onAssetIntegrity.details,
      );
    }
  }

  const resolvedUpstreamContexts = resolveAllUpstreamArtifactContexts({
    upstream,
    selectedChoices: semanticSelection.choices,
  });

  const onAssetRequired = contractRequiresOnAssetCommunication(
    compositionResolution.contract,
  );
  const upstreamSemanticGate = assertUpstreamSemanticProjectionForOnAsset({
    onAssetRequired,
    resolvedUpstream: resolvedUpstreamContexts,
    hasUserInstruction: Boolean(currentUserInstruction.trim()),
    selectedChoices: semanticSelection.choices,
  });
  if (!upstreamSemanticGate.ok) {
    return fail(
      input,
      upstreamSemanticGate.code,
      upstreamSemanticGate.message,
      {
        ...upstreamSemanticGate.details,
        ...upstreamContinuityDiagnostics(resolvedUpstreamContexts),
      },
    );
  }

  const enrichmentsBase = resolveCanonicalAssemblyEnrichments({
    ...metadata,
    ...(requiresAssembledDeck
      ? {
          service: metadata.service ?? serviceId,
          outputKind: metadata.outputKind ?? "presentation",
        }
      : {
          service: metadata.service ?? serviceId,
        }),
    cdfServiceId: serviceId,
  });

  const deliverableComposition =
    compositionResolution.required && compositionResolution.contract
      ? compileDeliverableComposition({
          deliverableKind: compositionResolution.deliverableKind,
          contract: compositionResolution.contract,
          selectedChoice: selectSemanticChoiceForComposition(
            semanticSelection.choices,
          ),
          currentUserInstruction,
          currentUserInstructionAuthority:
            currentUserInstructionSource === "phase_prompt"
              ? "phase_prompt"
              : "user_instruction",
          brandContext,
          productGrounding,
          deliverableLabel: resolved.phaseContext.outputLabel,
          phaseName: resolved.phaseContext.name,
          artifactKey: resolved.phaseContext.artifactKey,
          generationModality: resolved.phaseContext.generationModality,
        })
      : undefined;

  if (deliverableComposition && compositionResolution.contract) {
    const valueIntegrity = assertRequiredCommunicationValuesResolved({
      contract: compositionResolution.contract,
      compiled: deliverableComposition,
    });
    if (!valueIntegrity.ok) {
      return fail(
        input,
        valueIntegrity.code,
        valueIntegrity.message,
        valueIntegrity.details,
      );
    }
  }

  const enrichments = {
    ...enrichmentsBase,
    productionSpec: qualifyProductionSpecForRequiredComposition(
      enrichmentsBase.productionSpec,
      deliverableComposition,
    ),
    ...(deliverableComposition
      ? { deliverableComposition }
      : {}),
  };

  const modelRequest = assembleCanonicalModelRequest(request, enrichments);
  const compositionInvariant = assertRequiredOnAssetCompositionInCmr({
    compositionRequired: compositionResolution.required,
    contract:
      compositionResolution.required && compositionResolution.contract
        ? compositionResolution.contract
        : null,
    compiled: deliverableComposition ?? null,
    modelRequest,
  });
  if (!compositionInvariant.ok) {
    return fail(
      input,
      compositionInvariant.code,
      compositionInvariant.message,
      {
        ...compositionInvariant.details,
        ...upstreamContinuityDiagnostics(resolvedUpstreamContexts),
        DOWNSTREAM_COMPOSITION: deliverableComposition
          ? {
              requiredRenderedCommunication: {
                active:
                  deliverableComposition.requiredRenderedCommunication.active,
                surfaces:
                  deliverableComposition.requiredRenderedCommunication.surfaces.map(
                    (s) => ({
                      element: s.element,
                      resolutionStatus: s.resolutionStatus,
                      provenance: s.provenance ?? null,
                      hasText: Boolean(s.text?.trim()),
                    }),
                  ),
                unresolvedElements:
                  deliverableComposition.requiredRenderedCommunication
                    .unresolvedElements,
              },
              resolved:
                deliverableComposition.requiredRenderedCommunication
                  .allRequiredResolved,
              unresolved:
                deliverableComposition.requiredRenderedCommunication
                  .unresolvedElements,
            }
          : null,
        CMR_INVARIANT: { passed: false },
      },
    );
  }

  const counts = countCanonicalContentParts(modelRequest);
  const provenance = contextProvenanceMetadata(resolved);
  const upstreamSummary = summarizeUpstreamForObservability(
    request.upstreamArtifacts,
  );
  const sectionsPresent = detectCanonicalSectionsFromModelRequest(modelRequest);
  const referenceTraceEffective = summarizeGenerationReferencesForTrace(
    effectiveReferenceResolution,
  );
  const instructionFingerprint =
    instructionResolution.instructionFingerprint ??
    (currentUserInstruction
      ? (() => {
          let h = 2166136261;
          for (let i = 0; i < currentUserInstruction.length; i++) {
            h ^= currentUserInstruction.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          return (h >>> 0).toString(16).padStart(8, "0");
        })()
      : undefined);

  const providerIntentDiagnostics = buildProviderGenerationIntentDiagnostics({
    request,
    modelRequest,
    productionSpecPresent: Boolean(enrichments.productionSpec),
    referenceAssetsPresent:
      multimodalContext.items.length > 0 || nextAssets.length > 0,
    currentUserInstructionSource,
    currentUserInstructionFingerprint: instructionFingerprint,
    ctiEffectiveInstructionPresent: ctiEffectivePresent,
    brandIdentity: brandIdentityDiagnostics,
  });

  // Final gate: required unresolved refs must be zero when selection authority applies.
  if (
    providerIntentDiagnostics.unresolvedReferenceCount > 0 &&
    indexedChoiceSelections.length > 0 &&
    !providerIntentDiagnostics.selectedDirectionPresent
  ) {
    return fail(
      input,
      "CDF_SELECTION_REFERENCE_UNRESOLVED",
      "Unresolved generation references remain without a resolved selected semantic direction",
      {
        unresolvedReferenceCount:
          providerIntentDiagnostics.unresolvedReferenceCount,
        references: referenceTraceEffective.references,
      },
    );
  }

  const nextMeta: Record<string, unknown> = {
    ...enrichments.metadata,
    ...provenance,
    assets: nextAssets,
    ...(() => {
      if (metadata.image) return {};
      const firstImage = nextAssets.find((a) =>
        String((a as { mimeType?: string }).mimeType ?? "")
          .toLowerCase()
          .startsWith("image/"),
      );
      return firstImage ? { image: firstImage } : {};
    })(),
    [CDF_CANONICAL_CONTEXT_META.enabled]: true,
    [CDF_CANONICAL_CONTEXT_META.applied]: true,
    cdfCanonicalRolloutPath: "canonical",
    [CDF_CANONICAL_CONTEXT_META.hash]: request.generationContextHash,
    [CDF_CANONICAL_CONTEXT_META.contextId]: request.cdfContext.contextId,
    [CDF_CANONICAL_CONTEXT_META.fullDeck]: requiresAssembledDeck,
    [CDF_CANONICAL_CONTEXT_META.upstreamCount]: request.upstreamArtifacts.length,
    [CDF_CANONICAL_CONTEXT_META.fallbackUsed]: false,
    [CDF_CANONICAL_CONTEXT_META.resolutionOk]: true,
    [CDF_CANONICAL_CONTEXT_META.sectionsPresent]: sectionsPresent,
    [CDF_CANONICAL_CONTEXT_META.modelRequestApplied]: true,
    [CDF_CANONICAL_CONTEXT_META.messageCount]: counts.messageCount,
    [CDF_CANONICAL_CONTEXT_META.contentPartCount]: counts.contentPartCount,
    [CDF_CANONICAL_CONTEXT_META.structuredPartCount]: counts.structuredPartCount,
    [CDF_CANONICAL_CONTEXT_META.assemblyComplete]: true,
    [CDF_CANONICAL_CONTEXT_META.skipPostCmrAppends]: true,
    [CDF_CANONICAL_CONTEXT_META.productionSpecPresent]: Boolean(
      enrichments.productionSpec,
    ),
    [CDF_CANONICAL_CONTEXT_META.outputRequirementsPresent]: Boolean(
      enrichments.outputRequirements,
    ),
    [CDF_CANONICAL_CONTEXT_META.referenceResolutionApplied]:
      referenceTraceEffective.referenceResolutionApplied,
    [CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount]:
      referenceTraceEffective.resolvedReferenceCount,
    [CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount]:
      referenceTraceEffective.unresolvedReferenceCount,
    [CDF_CANONICAL_CONTEXT_META.ambiguousReferenceCount]:
      referenceTraceEffective.ambiguousReferenceCount,
    cdfCanonicalReferences: referenceTraceEffective.references,
    [CDF_CANONICAL_CONTEXT_META.selectedDirectionPresent]:
      providerIntentDiagnostics.selectedDirectionPresent,
    ...(providerIntentDiagnostics.selectedDirectionIdentity
      ? {
          [CDF_CANONICAL_CONTEXT_META.selectedDirectionIdentity]:
            providerIntentDiagnostics.selectedDirectionIdentity,
        }
      : {}),
    // Structured X@V pin — same SelectedSemanticChoice as identity / CMR directions.
    // Observational diagnostic projection only; does not alter generation authority.
    ...(request.selectedSemanticChoices?.[0]
      ? {
          [CDF_CANONICAL_CONTEXT_META.selectedArtifactId]:
            request.selectedSemanticChoices[0].artifactId,
          [CDF_CANONICAL_CONTEXT_META.selectedArtifactVersion]:
            request.selectedSemanticChoices[0].version,
          [CDF_CANONICAL_CONTEXT_META.selectedArtifactKey]:
            request.selectedSemanticChoices[0].artifactKey,
        }
      : {}),
    ...(request.userSelectedGenerationReference
      ? {
          cdfGenerationContinuation: request.userSelectedGenerationReference,
          cdfContinuationVisualArtifactId:
            request.userSelectedGenerationReference.visualArtifactId,
          cdfContinuationExecutionId:
            request.userSelectedGenerationReference.executionId,
          cdfContinuationIsDiagnosticRaw:
            request.userSelectedGenerationReference.isDiagnosticRaw === true,
          ...(request.userSelectedGenerationReference.generationFanoutTargetId
            ? {
                cdfContinuationFanoutTargetId:
                  request.userSelectedGenerationReference
                    .generationFanoutTargetId,
              }
            : {}),
          // Reference-only stamp for downstream create — never a selectedArtifacts pin.
          ...(request.userSelectedGenerationReference.visualArtifactId.startsWith(
            "art_",
          )
            ? {
                cdfContinuationRawArtifactIds: [
                  request.userSelectedGenerationReference.visualArtifactId,
                ],
              }
            : {}),
        }
      : {}),
    [CDF_CANONICAL_CONTEXT_META.selectedDirectionSemanticFields]:
      providerIntentDiagnostics.selectedDirectionSemanticFields,
    cdfUpstreamContinuity: {
      ...upstreamContinuityDiagnostics(resolvedUpstreamContexts),
      DOWNSTREAM_COMPOSITION: deliverableComposition
        ? {
            requiredRenderedCommunication: {
              active:
                deliverableComposition.requiredRenderedCommunication.active,
              surfaces:
                deliverableComposition.requiredRenderedCommunication.surfaces.map(
                  (s) => ({
                    element: s.element,
                    resolutionStatus: s.resolutionStatus,
                    provenance: s.provenance ?? null,
                    hasText: Boolean(s.text?.trim()),
                  }),
                ),
              unresolvedElements:
                deliverableComposition.requiredRenderedCommunication
                  .unresolvedElements,
            },
            resolved:
              deliverableComposition.requiredRenderedCommunication
                .allRequiredResolved,
            unresolved:
              deliverableComposition.requiredRenderedCommunication
                .unresolvedElements,
          }
        : null,
      CMR_INVARIANT: { passed: true },
    },
    [CDF_CANONICAL_CONTEXT_META.brandContextPresent]:
      providerIntentDiagnostics.brandContextPresent,
    [CDF_CANONICAL_CONTEXT_META.brandFactKeys]:
      providerIntentDiagnostics.brandFactKeys,
    [CDF_CANONICAL_CONTEXT_META.brandFactProvenance]:
      providerIntentDiagnostics.brandFactProvenance,
    ...(providerIntentDiagnostics.selectedBrandId
      ? {
          [CDF_CANONICAL_CONTEXT_META.selectedBrandId]:
            providerIntentDiagnostics.selectedBrandId,
        }
      : {}),
    ...(providerIntentDiagnostics.selectedCanonicalBrandName
      ? {
          [CDF_CANONICAL_CONTEXT_META.selectedCanonicalBrandName]:
            providerIntentDiagnostics.selectedCanonicalBrandName,
        }
      : {}),
    [CDF_CANONICAL_CONTEXT_META.extractedBrandEntities]:
      providerIntentDiagnostics.extractedBrandEntities,
    [CDF_CANONICAL_CONTEXT_META.extractionAttemptedIdentityMutation]:
      providerIntentDiagnostics.extractionAttemptedIdentityMutation,
    [CDF_CANONICAL_CONTEXT_META.userInstructionPresent]:
      providerIntentDiagnostics.userInstructionPresent,
    [CDF_CANONICAL_CONTEXT_META.currentUserInstructionSource]:
      providerIntentDiagnostics.currentUserInstructionSource,
    ...(providerIntentDiagnostics.currentUserInstructionFingerprint
      ? {
          [CDF_CANONICAL_CONTEXT_META.currentUserInstructionFingerprint]:
            providerIntentDiagnostics.currentUserInstructionFingerprint,
        }
      : {}),
    [CDF_CANONICAL_CONTEXT_META.ctiEffectiveInstructionPresent]:
      providerIntentDiagnostics.ctiEffectiveInstructionPresent,
    [CDF_CANONICAL_CONTEXT_META.productGroundingPresent]: Boolean(
      request.productGrounding,
    ),
    [CDF_CANONICAL_CONTEXT_META.generationIntentHash]:
      providerIntentDiagnostics.generationIntentHash,
    [CDF_CANONICAL_CONTEXT_META.canonicalModelRequestHash]:
      providerIntentDiagnostics.canonicalModelRequestHash,
    [CDF_CANONICAL_CONTEXT_META.providerIntentDiagnostics]:
      providerIntentDiagnostics,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryApplied]:
      workingMemoryTrace.workingMemoryApplied,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryItemCount]:
      workingMemoryTrace.workingMemoryItemCount,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryCharacterCount]:
      workingMemoryTrace.workingMemoryCharacterCount,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryTurnCount]:
      workingMemoryTrace.workingMemoryTurnCount,
    [CDF_CANONICAL_CONTEXT_META.workingMemorySelectionMethod]:
      workingMemoryTrace.workingMemorySelectionMethod,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryTruncated]:
      workingMemoryTrace.workingMemoryTruncated,
    [CDF_CANONICAL_CONTEXT_META.workingMemoryDroppedItemCount]:
      workingMemoryTrace.workingMemoryDroppedItemCount,
    ...(workingMemoryTrace.workingMemorySourceConversationId
      ? {
          [CDF_CANONICAL_CONTEXT_META.workingMemorySourceConversationId]:
            workingMemoryTrace.workingMemorySourceConversationId,
        }
      : {}),
    [CDF_CANONICAL_CONTEXT_META.conversationIdPresent]:
      handoffObs.conversationIdPresent,
    [CDF_CANONICAL_CONTEXT_META.channelIdPresent]: handoffObs.channelIdPresent,
    [CDF_CANONICAL_CONTEXT_META.conversationContextAvailable]:
      handoffObs.conversationContextAvailable,
    [CDF_CANONICAL_CONTEXT_META.conversationMessageCountLoaded]:
      handoffObs.conversationMessageCountLoaded,
    [CDF_CANONICAL_CONTEXT_META.artifactContextApplied]:
      artifactTrace.artifactContextApplied,
    [CDF_CANONICAL_CONTEXT_META.requiredArtifactCount]:
      artifactTrace.requiredArtifactCount,
    [CDF_CANONICAL_CONTEXT_META.optionalArtifactCount]:
      artifactTrace.optionalArtifactCount,
    [CDF_CANONICAL_CONTEXT_META.loadedArtifactCount]:
      artifactTrace.loadedArtifactCount,
    [CDF_CANONICAL_CONTEXT_META.missingArtifactCount]:
      artifactTrace.missingArtifactCount,
    [CDF_CANONICAL_CONTEXT_META.skippedOptionalArtifactCount]:
      artifactTrace.skippedOptionalCount,
    [CDF_CANONICAL_CONTEXT_META.artifactContextHash]:
      artifactTrace.artifactContextHash,
    [CDF_CANONICAL_CONTEXT_META.loadedArtifactsFromReferences]:
      artifactTrace.loadedFromReferences,
    cdfArtifactVersions: artifactTrace.artifactVersions,
    cdfArtifactKeys: artifactTrace.artifactKeys,
    cdfArtifactPhases: artifactTrace.artifactPhases,
    [CDF_CANONICAL_CONTEXT_META.multimodalContextApplied]:
      multimodalTrace.multimodalContextApplied,
    [CDF_CANONICAL_CONTEXT_META.multimodalItemCount]:
      multimodalTrace.multimodalItemCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalImageCount]:
      multimodalTrace.multimodalImageCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalDocumentCount]:
      multimodalTrace.multimodalDocumentCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalUnsupportedCount]:
      multimodalTrace.multimodalUnsupportedCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalExtractedTextCount]:
      multimodalTrace.multimodalExtractedTextCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalProviderMappedCount]:
      multimodalProjection.mappedCount,
    [CDF_CANONICAL_CONTEXT_META.multimodalProviderOmittedCount]:
      multimodalProjection.omitted.length,
    [CDF_CANONICAL_CONTEXT_META.multimodalSelectionMethod]:
      multimodalTrace.multimodalSelectionMethod,
    [CDF_CANONICAL_CONTEXT_META.canonicalMultimodalProviderMappingApplied]:
      multimodalContext.applied,
    [CDF_CANONICAL_CONTEXT_META.canonicalMultimodalMappingSource]: multimodalContext.applied
      ? "cmr_multimodal_context"
      : undefined,
    [CDF_CANONICAL_CONTEXT_META.canonicalMultimodalMappedCount]:
      multimodalProjection.mappedCount,
    [CDF_CANONICAL_CONTEXT_META.canonicalMultimodalOmittedCount]:
      multimodalProjection.omitted.length,
    [CDF_CANONICAL_CONTEXT_META.canonicalMultimodalItemCount]:
      multimodalContext.items.length,
    cdfMultimodalMimeTypes: multimodalTrace.multimodalMimeTypes,
    cdfMultimodalSourceTypes: multimodalTrace.multimodalSourceTypes,
    cdfMultimodalAssetIds: multimodalTrace.multimodalAssetIds,
    cdfMultimodalProviderOmitted: multimodalProjection.omitted.map((o) => ({
      itemId: o.itemId,
      reason: o.reason,
      mimeType: o.mimeType,
      modality: o.modality,
    })),
    [CANONICAL_MODEL_REQUEST_META_KEY]: modelRequest,
    cdfCanonicalUpstream: upstreamSummary,
    cdfActiveBriefId: request.cdfContext.activeBriefId,
    cdfActiveBriefVersion: request.cdfContext.activeBriefVersion,
    cdfSkipEffectiveInstructionReplace: true,
    ...(requiresAssembledDeck
      ? {
          cdfOmitConceptsExpansion: true,
          deliverableRequired: true,
          outputKind: "presentation",
        }
      : {}),
  };

  emitCanonicalContextCompiledTrace({
    request,
    modelRequest,
    executionId,
    correlationId:
      typeof metadata.correlationId === "string"
        ? metadata.correlationId
        : executionId,
    upstream: upstreamSummary,
    artifactContext: artifactTrace,
    providerIntentDiagnostics,
    multimodalContext: {
      multimodalContextApplied: Boolean(multimodalTrace.multimodalContextApplied),
      multimodalItemCount: Number(multimodalTrace.multimodalItemCount ?? 0),
      multimodalImageCount: Number(multimodalTrace.multimodalImageCount ?? 0),
      multimodalDocumentCount: Number(
        multimodalTrace.multimodalDocumentCount ?? 0,
      ),
      multimodalUnsupportedCount: Number(
        multimodalTrace.multimodalUnsupportedCount ?? 0,
      ),
      multimodalExtractedTextCount: Number(
        multimodalTrace.multimodalExtractedTextCount ?? 0,
      ),
      multimodalProviderMappedCount: multimodalProjection.mappedCount,
      multimodalProviderOmittedCount: multimodalProjection.omitted.length,
      multimodalSelectionMethod: String(
        multimodalTrace.multimodalSelectionMethod ?? "",
      ),
    },
  });

  return {
    ok: true,
    skipped: false,
    request,
    modelRequest,
    prompt: CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
    metadata: nextMeta,
  };
}
