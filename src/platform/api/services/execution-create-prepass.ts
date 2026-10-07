/**
 * Create-execution prepass — validation, tenant, output map metadata,
 * matrix model routing, idempotency. Direct provider path only.
 */

import {
  parseProviderPinPolicy,
  providerPinMetadataStamps,
} from "../../providers/routing/provider-pin-policy";
import { failure, success, type Result } from "../../core/result";
import { ValidationError, AuthorizationError } from "../../core/errors";
import type { AuthPrincipal, CreateExecutionRequest } from "../contracts";
import { isFirebaseAuthenticatedPrincipal } from "../auth/firebase/firebase-authentication-adapter";
import {
  parseProductMode,
  productModeBlocksAiExecution,
  PRODUCT_MODE_HUMAN_AI_BLOCKED,
} from "../../config/product-mode";
import {
  resolveServiceOutputSpec,
} from "../../config/service-output-map";
import { PRESENTATION_ROUTE_CONCEPTS_SCHEMA } from "../../os/delivery/presentation-schemas";
import { PRESENTATION_ROUTES_STRUCTURED_SCHEMA } from "../../os/delivery/presentation-schemas";
import { stampPresentationCreateMetadata } from "../../direct/presentation-direct-metadata";
import { stampDocumentCreateMetadata } from "../../direct/document-direct-metadata";
import { stampEmailCreateMetadata } from "../../direct/email-direct-metadata";
import { shouldOmitCdfStructuredStamp } from "../../cdf/phase-scoped-create";
import { stampCanonicalStructuredOutputMetadata } from "../../cdf/structured-output-contract";
import { WEBSITE_ROUTES_STRUCTURED_SCHEMA } from "../../os/delivery/website-generation";
import {
  isAudioTranscribeCapability,
  isAudioSynthesizeCapability,
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../providers/common/resolve-execution-modality";
import { attachProductAssetsToExecutionMetadata } from "../../../services/product-asset-input-bridge";
import { ApiError } from "../../../utils/apiError";
import {
  EXECUTION_MAX_METADATA_BYTES,
  type ExecutionCreateHost,
} from "./execution-create-host";
import {
  type CreatePipelineState,
  type PhaseOutcome,
} from "./execution-create-state";
import { applyDirectPassthroughMetadata, productActionFromMetadata, sanitizeMediaGenerationCreateMetadata } from "./execution-thin-path";
import { runContinuityBindPipeline } from "../../os/creative/continuity-bind-pipeline";
import {
  briefAssistMetadataExtras,
  runBriefAssist,
} from "../../os/creative/brief-assist";
import { runPackPlannerOnCreate } from "../../os/creative/multi-deliverable-pack";
import { sharpenContinuityRoutingPins } from "../../os/creative/continuity-model-router";
import { runProductIntelligenceUx } from "../../os/creative/continuity-product-ux";
import { scheduleLearnBrandKnowledgeFromPromptUntrusted } from "../../../services/brand-learn-from-brief";
import {
  buildJobObjectFromContext,
  jobObjectMetadataExtras,
} from "../../os/creative/job-object-builder";
import {
  brandProfileFromFacts,
  resolveBrandProfileFacts,
} from "../../os/creative/brand-profile-facts";
import { enrichBrandPreferencesFromBrief, type EnrichedBrandPreferences } from "../../../services/brand-brief-llm-extractor";
import { metadataBrandColorExtras } from "../../../services/brand-inline-color-satisfaction";
import type { ProductBrandPreferences } from "../../../services/brand-preference-writer";
import {
  applyConfirmedBrandId,
  runBrandMismatchCheck,
} from "../../os/creative/brand-mismatch-check";
import { ensureBrandLogoInExecutionMetadata } from "../../../services/ensure-brand-logo-execution-metadata";
import {
  classifyCreativeIntent,
  creativeIntentMetadataExtras,
  logoRoleFromMetadata,
} from "../../os/creative/creative-intent-classifier";
import { resolveBrandProfileContext } from "../../os/creative/brand-profile-facts";
import { applyAdaptiveRoutingToPrepass } from "../../providers/routing/performance/benchmark/adaptive/apply-adaptive-routing-prepass";
import { loadAdaptiveRoutingConfig } from "../../providers/routing/performance/config/adaptive-routing-config";
import {
  beginExecutionTrace,
  recordClassificationTrace,
  recordExecutionTraceStage,
  updateExecutionTrace,
} from "../../os/observability/execution-trace";
import { logOsExecutionEvent } from "../../os/observability/execution-log";
import { readExecutionSpecSnapshot } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import {
  applyVisualModificationPrepass,
  routeImageWithReferenceSupport,
} from "./apply-visual-modification-prepass";
import {
  isGenerationFanoutLeafMetadata,
  resolveIntraLeafFailoverChain,
  INTRA_PROVIDER_VIDEO_MODEL_FALLBACKS,
} from "../../generation/generation-fanout";

function brandDisplayName(
  metadata: Readonly<Record<string, unknown>> | undefined
): string {
  const name =
    typeof metadata?.brandName === "string" ? metadata.brandName.trim() : "";
  return name || "This brand";
}

function continuitySlotCheckApplies(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  const action = productActionFromMetadata(metadata)?.toLowerCase();
  if (!action) return true;
  return !new Set([
    "enhance_prompt",
    "refine_brief",
    "refine_question",
    "brand_brief_extract",
  ]).has(action);
}

function sanitizePassthroughPrompt(raw: string): string {
  let text = raw.trim();
  if (!text) return text;
  if (/^\[Prompt facts/i.test(text)) {
    const preview = text.match(/Brief preview:\s*([\s\S]*)/i);
    if (preview?.[1]?.trim()) text = preview[1].trim();
  }
  if (/\[REFINE MODE/i.test(text)) {
    const locked = text.match(
      /\[Locked brief[^\]]*\]\s*([\s\S]*?)(?=\n\[Client refinement|\n\[Output requirements|$)/i
    );
    const notes = text.match(
      /\[Client refinement notes[^\]]*\]\s*([\s\S]*?)(?=\n\[Output requirements|$)/i
    );
    const lockedBrief = locked?.[1]?.trim() ?? "";
    const noteText = (notes?.[1] ?? "").trim();
    const notesEmpty = !noteText || /^\(none yet/i.test(noteText);
    if (lockedBrief) {
      return notesEmpty
        ? lockedBrief
        : `${lockedBrief}\n\nApply these refinements:\n${noteText}`;
    }
  }
  return text
    .replace(/^\[Product selection[\s\S]*?\]\s*/i, "")
    .replace(/^\[User brief\]\s*/i, "")
    .trim();
}

/** Client route fan-out pins live in metadata — lift them for matrix routers. */
/**
 * Requested identity for the execution trace: client pin, else the
 * routed/declared model before dispatch — provider fallback must not erase
 * what the execution asked for.
 */
export function resolveTraceRequestedIdentity(
  routingPin: { providerId?: string; modelId?: string },
  metadata: Readonly<Record<string, unknown>> | undefined,
): { requestedProviderId?: string; requestedModelId?: string } {
  const providerId =
    routingPin.providerId ??
    (typeof metadata?.preferredProviderId === "string"
      ? metadata.preferredProviderId
      : undefined);
  const modelId =
    routingPin.modelId ??
    (typeof metadata?.preferredModelId === "string"
      ? metadata.preferredModelId
      : undefined);
  return { requestedProviderId: providerId, requestedModelId: modelId };
}

export function resolveClientRoutingPin(
  req: CreateExecutionRequest,
  metadata: Readonly<Record<string, unknown>> | undefined
): { providerId?: string; modelId?: string } {
  const providerId =
    req.providerId?.trim() ||
    (typeof metadata?.preferredProviderId === "string"
      ? metadata.preferredProviderId.trim()
      : undefined) ||
    (typeof metadata?.requestedProvider === "string"
      ? metadata.requestedProvider.trim()
      : undefined) ||
    (typeof metadata?.providerId === "string"
      ? metadata.providerId.trim()
      : undefined);
  const modelId =
    req.modelId?.trim() ||
    (typeof metadata?.preferredModelId === "string"
      ? metadata.preferredModelId.trim()
      : undefined) ||
    (typeof metadata?.requestedModel === "string"
      ? metadata.requestedModel.trim()
      : undefined) ||
    (typeof metadata?.modelId === "string" ? metadata.modelId.trim() : undefined);
  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
  };
}

/**
 * Byte length of control metadata. Inline media (data-URL audio/image bytes)
 * is omitted so a voice note or attachment is not treated as metadata bloat.
 */
function metadataControlByteLength(metadata: unknown): number {
  const serialized = JSON.stringify(metadata, (_key, value: unknown) => {
    if (
      typeof value === "string" &&
      value.startsWith("data:") &&
      value.includes(";base64,")
    ) {
      return "";
    }
    return value;
  });
  return serialized?.length ?? 0;
}

export async function runCreatePrepass(
  host: ExecutionCreateHost,
  req: CreateExecutionRequest,
  principal: AuthPrincipal
): Promise<Result<PhaseOutcome<CreatePipelineState>>> {
  let capabilityIdRaw = String(req.capabilityId ?? "");
  const isStt = isAudioTranscribeCapability(capabilityIdRaw);
  let prompt = req.prompt?.trim() ?? "";
  if (!prompt && isStt) {
    prompt = "Transcribe the attached audio.";
  }
  if (!prompt) {
    // Phase A4: empty + explicit Brief Assist opt-in → structured ASK (not bare required).
    const earlyMeta = req.metadata ?? {};
    const assistEarly = runBriefAssist({
      brief: "",
      organizationId: req.organizationId,
      metadata: earlyMeta,
    });
    if (assistEarly?.blockGenerate) {
      return failure(
        new ValidationError(
          "Brief is empty. Answer the Brief Assist questions, then retry with a fuller brief.",
          {
            reason: "CONTINUITY_BRIEF_ASSIST",
            questions: assistEarly.questions,
            suggestedScaffold: assistEarly.suggestedScaffold,
          }
        )
      );
    }
    return failure(new ValidationError("prompt is required"));
  }
  if (!req.organizationId) {
    return failure(new ValidationError("organizationId is required"));
  }
  if (
    req.metadata &&
    metadataControlByteLength(req.metadata) > EXECUTION_MAX_METADATA_BYTES
  ) {
    return failure(new ValidationError("metadata exceeds maximum size"));
  }
  if (
    req.tokenBudgetLimit != null &&
    (req.tokenBudgetLimit <= 0 || !Number.isFinite(req.tokenBudgetLimit))
  ) {
    return failure(new ValidationError("tokenBudgetLimit must be a positive number"));
  }

  if (isFirebaseAuthenticatedPrincipal(principal)) {
    if (!principal.organizationId) {
      return failure(
        new AuthorizationError("organization not resolved for authenticated user")
      );
    }
    if (principal.organizationId !== req.organizationId) {
      return failure(new AuthorizationError("tenant isolation violation"));
    }
  } else if (
    principal.organizationId &&
    principal.organizationId !== req.organizationId
  ) {
    return failure(new AuthorizationError("tenant isolation violation"));
  }

  const trustedOrganizationId =
    isFirebaseAuthenticatedPrincipal(principal) && principal.organizationId
      ? principal.organizationId
      : req.organizationId;

  const earlyProductMode = parseProductMode(req.metadata);
  if (productModeBlocksAiExecution(earlyProductMode)) {
    return failure(
      new AuthorizationError(PRODUCT_MODE_HUMAN_AI_BLOCKED, {
        reason: "PRODUCT_MODE_HUMAN",
      })
    );
  }

  let workingMetadata = applyDirectPassthroughMetadata(
    req.metadata ? { ...req.metadata } : undefined
  );
  // Enhanced prompts are shown to the user — keep provider-only production
  // specs, gates and output contracts out; they are applied at generation time.
  if (productActionFromMetadata(workingMetadata)?.toLowerCase() === "enhance_prompt") {
    workingMetadata = {
      ...workingMetadata,
      skipProductionSpecInstruct: true,
      skipOutputRequirements: true,
      cdfSkipEffectiveInstructionReplace: true,
    };
    delete workingMetadata.productionPromptBlockText;
    delete workingMetadata.conversationalEffectiveInstruction;
  }

  // Service conversation context — derive follow-up intent + continuity from persisted chat.
  let conversationExecutionSpec: import("../../collaboration/conversational-task-intelligence").CanonicalExecutionSpecification | undefined;
  const isRouteVisualFanout =
    typeof workingMetadata?.productAction === "string" &&
    (workingMetadata.productAction.trim().toLowerCase() === "route_visual" ||
      workingMetadata.productAction.trim().toLowerCase() === "route_visual_refine");
  const isCdfPhaseRun =
    workingMetadata?.cdfSkipHeavyPrepass === true ||
    (typeof workingMetadata?.cdfPhaseId === "string" &&
      workingMetadata.cdfPhaseId.trim().length > 0);

  // P0 — Canonical CDF phases must never use legacy route_visual / direct_routes_*.
  {
    const { resolveCdfPhaseExecutionContract } = await import(
      "../../cdf/canonical"
    );
    const cdfServiceId =
      typeof workingMetadata?.cdfServiceId === "string"
        ? workingMetadata.cdfServiceId.trim()
        : "";
    const cdfPhaseId =
      typeof workingMetadata?.cdfPhaseId === "string"
        ? workingMetadata.cdfPhaseId.trim()
        : "";
    const stampedStrategy =
      typeof workingMetadata?.cdfExecutionStrategy === "string"
        ? workingMetadata.cdfExecutionStrategy.trim()
        : "";
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: cdfServiceId,
      phaseId: cdfPhaseId,
    });
    const requiresCanonical =
      stampedStrategy === "canonical" ||
      contract?.requiresCanonicalCreate === true;
    if (requiresCanonical && isRouteVisualFanout) {
      return failure(
        new ValidationError(
          "productAction=route_visual is not allowed for a canonical CDF phase; use the phase artifact contract",
          {
            reason: "CDF_CANONICAL_ROUTE_VISUAL_FORBIDDEN",
            cdfServiceId,
            cdfPhaseId,
            artifactKey: contract?.artifactKey,
            executionStrategy: contract?.executionStrategy ?? stampedStrategy,
          },
        ),
      );
    }
    const parentTarget =
      typeof workingMetadata?.parentExecutionId === "string"
        ? workingMetadata.parentExecutionId.trim()
        : typeof workingMetadata?.targetExecutionId === "string"
          ? workingMetadata.targetExecutionId.trim()
          : "";
    const refineFrom =
      typeof workingMetadata?.refineFromExecutionId === "string"
        ? workingMetadata.refineFromExecutionId.trim()
        : "";
    const conversationalRef =
      typeof workingMetadata?.conversationalReferencedExecutionId === "string"
        ? workingMetadata.conversationalReferencedExecutionId.trim()
        : "";
    if (
      requiresCanonical &&
      (parentTarget.startsWith("direct_routes_") ||
        refineFrom.startsWith("direct_routes_") ||
        conversationalRef.startsWith("direct_routes_"))
    ) {
      return failure(
        new ValidationError(
          "direct_routes_* is not a valid execution target for a canonical CDF phase",
          {
            reason: "CDF_CANONICAL_DIRECT_ROUTES_FORBIDDEN",
            cdfServiceId,
            cdfPhaseId,
            artifactKey: contract?.artifactKey,
          },
        ),
      );
    }
  }
  try {
    const channelId =
      typeof workingMetadata?.channelId === "string"
        ? workingMetadata.channelId.trim()
        : "";
    const userId = principal.userId?.trim();
    const { readClientExecutionSpecHandoff, readInheritedExecutionSpec } =
      await import(
        "../../collaboration/conversational-task-intelligence/execution-spec-handoff"
      );
    const clientHandoffSpec = readClientExecutionSpecHandoff(workingMetadata);
    conversationExecutionSpec =
      clientHandoffSpec ??
      (await readInheritedExecutionSpec({
        host,
        metadata: workingMetadata,
      }));
    const hasClientConversationHandoff = conversationExecutionSpec != null;
    // CDF phase creates already know service/phase — skip CTI semantic classify tax.
    if (channelId && userId && !hasClientConversationHandoff && !isCdfPhaseRun) {
      const { serviceConversationService } = await import(
        "../../collaboration/service-conversation-service"
      );
      let contextMessage = prompt;
      if (isRouteVisualFanout) {
        try {
          const full = await serviceConversationService.getFullConversation({
            userId,
            channelId,
          });
          const lastUser = [...full.messages]
            .reverse()
            .find((m) => m.role === "user" && m.text?.trim())?.text
            ?.trim();
          if (lastUser) contextMessage = lastUser;
        } catch {
          // Fall back to prompt when conversation history is unavailable.
        }
      }
      const ctx = await serviceConversationService.buildExecutionContext({
        userId,
        channelId,
        latestUserMessage: contextMessage,
        persistTaskIntelligence: !isRouteVisualFanout,
      });
      conversationExecutionSpec = ctx.executionSpec;
      if (
        ctx.clarificationRequired &&
        ctx.clarificationQuestion
      ) {
        return failure(
          new ValidationError(ctx.clarificationQuestion, {
            reason: "CONVERSATIONAL_CLARIFICATION_REQUIRED",
            clarificationQuestion: ctx.clarificationQuestion,
            clarification: ctx.clarification,
          }),
        );
      }
      if (
        ctx.executionSpec?.resolutionState === "UNSUPPORTED_DELIVERABLE" &&
        !isRouteVisualFanout
      ) {
        return failure(
          new ValidationError(
            `Requested deliverable format is not supported for this service: ${(ctx.executionSpec.unsupportedDeliverables ?? []).join(", ")}`,
            {
              reason: "UNSUPPORTED_DELIVERABLE",
              unsupportedDeliverables: ctx.executionSpec.unsupportedDeliverables,
              executionSpec: ctx.executionSpec,
            },
          ),
        );
      }
      if (
        !isRouteVisualFanout &&
        ctx.effectiveInstruction &&
        ctx.requiresExecution &&
        ctx.effectiveInstruction.trim() !== prompt.trim()
      ) {
        // Phase 2: do not replace CDF phase prompts with flat CTI when canonical
        // generation context will compile the authoritative request.
        const { isCdfCanonicalGenerationContextEnabled, hasCdfSessionPhaseMetadata } =
          await import("../../cdf/generation-context");
        const skipForCanonical =
          isCdfCanonicalGenerationContextEnabled() &&
          hasCdfSessionPhaseMetadata(workingMetadata);
        if (!skipForCanonical) {
          prompt = ctx.effectiveInstruction.trim();
        }
      }
      workingMetadata = applyDirectPassthroughMetadata({
        ...workingMetadata,
        conversationId: ctx.conversationId,
        channelId: ctx.channelId,
        conversationIntent: ctx.intent,
        priorUserInstructions: ctx.priorUserInstructions,
        originalUserBrief: ctx.originalUserBrief,
        ...(ctx.refineFromExecutionId &&
        !workingMetadata?.refineFromExecutionId
          ? { refineFromExecutionId: ctx.refineFromExecutionId }
          : {}),
        ...(ctx.selectedRouteId && !workingMetadata?.refineRouteId
          ? { refineRouteId: ctx.selectedRouteId }
          : {}),
        ...(ctx.selectedRouteTitle && !workingMetadata?.refineRouteTitle
          ? { refineRouteTitle: ctx.selectedRouteTitle }
          : {}),
        ...(ctx.intent === "export" && ctx.activeExecutionId
          ? {
              exportOnly: true,
              exportFromExecutionId: ctx.activeExecutionId,
              exportFormat: ctx.exportFormat,
            }
          : {}),
        ...(ctx.conversationalAction
          ? {
              conversationalAction: ctx.conversationalAction,
              conversationalRequiresExecution: ctx.requiresExecution,
              conversationalClarificationRequired: ctx.clarificationRequired,
              conversationalEffectiveInstruction: ctx.effectiveInstruction,
              conversationalActiveThreadId: ctx.activeThreadId,
              conversationalReferencedExecutionId: ctx.referencedExecutionId,
              conversationalReferencedArtifactId: ctx.referencedArtifactId,
            }
          : {}),
        ...(ctx.executionSpec
          ? {
              executionSpecPlaneVersion: ctx.executionSpec.planeVersion,
              executionSpecResolutionState: ctx.executionSpec.resolutionState,
              executionSpecOutputMode: ctx.executionSpec.outputIntent.mode.value,
              executionSpecDeliverables: ctx.executionSpec.deliverables.map(
                (d) => d.format,
              ),
              executionSpecQuantity: ctx.executionSpec.content.quantity?.value,
            }
          : {}),
      });
      // Snapshot stamping deferred until executionId is assigned (P4.8.1).
    } else if (hasClientConversationHandoff && conversationExecutionSpec) {
      if (
        conversationExecutionSpec.resolutionState === "UNSUPPORTED_DELIVERABLE" &&
        conversationExecutionSpec.unsupportedDeliverables?.length &&
        !isRouteVisualFanout
      ) {
        return failure(
          new ValidationError(
            `Requested deliverable format is not supported for this service: ${conversationExecutionSpec.unsupportedDeliverables.join(", ")}`,
            {
              reason: "UNSUPPORTED_DELIVERABLE",
              unsupportedDeliverables:
                conversationExecutionSpec.unsupportedDeliverables,
              executionSpec: conversationExecutionSpec,
            },
          ),
        );
      }
    }
  } catch {
    // Conversation context must never block generation.
  }

  // Track A Phase A4 — Brief Assist (empty/vague + opt-in only; never silent rewrite).
  try {
    const assist = runBriefAssist({
      brief: prompt,
      organizationId: trustedOrganizationId,
      metadata: workingMetadata,
    });
    if (assist?.needsAssist) {
      const extras = briefAssistMetadataExtras(assist);
      if (extras) {
        workingMetadata = applyDirectPassthroughMetadata({
          ...workingMetadata,
          ...extras,
        });
      }
      if (assist.blockGenerate) {
        return failure(
          new ValidationError(
            "Brief is too vague to generate well. Answer the Brief Assist questions (or expand your brief), then retry.",
            {
              reason: "CONTINUITY_BRIEF_ASSIST",
              questions: assist.questions,
              suggestedScaffold: assist.suggestedScaffold,
            }
          )
        );
      }
    }
  } catch {
    // Brief assist must never break thin create when flag misbehaves.
  }

  // Track A Phase A4 — pack planner (packs only; first leaf runs on this create).
  try {
    const pack = runPackPlannerOnCreate({
      brief: prompt,
      organizationId: trustedOrganizationId,
      metadata: workingMetadata,
      capabilityHint: capabilityIdRaw || undefined,
      createId: host.deps.createId,
    });
    if (pack?.applied) {
      workingMetadata = applyDirectPassthroughMetadata(pack.metadata);
      if (
        typeof pack.metadata.packLeafPrompt === "string" &&
        pack.metadata.packLeafPrompt.trim()
      ) {
        // Leaf prompt is a thin annotation of the same brief — keep user intent.
        prompt = pack.metadata.packLeafPrompt.trim();
      }
    }
  } catch {
    // Pack planner must never break thin create when flag misbehaves.
  }

  // Track A Phase A4 — routing pin sharpening (no brief rewrite).
  try {
    const sharpened = sharpenContinuityRoutingPins({
      metadata: workingMetadata,
      reqProviderId: req.providerId,
      reqModelId: req.modelId,
      refineReuse: workingMetadata.continuityRefineReuse === true,
    });
    workingMetadata = applyDirectPassthroughMetadata(sharpened.metadata);
  } catch {
    // Non-fatal.
  }

  // Brand mismatch ASK — before extract / continuity / provider.
  // Confirmed execution.brandId is the only creative ownership SoT.
  let brandIdForUx =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";

  if (brandIdForUx && prompt.trim()) {
    try {
      const mismatch = await runBrandMismatchCheck({
        brief: prompt,
        brandId: brandIdForUx,
        organizationId: trustedOrganizationId,
        metadata: workingMetadata,
      });
      if (mismatch?.ask) {
        const primary = mismatch.prompt;
        return failure(
          new ValidationError(primary.message, {
            reason: primary.code,
            prompts: [primary],
            choices: primary.choices,
            details: primary.details,
            forceStayInService: workingMetadata?.forceStayInService === true,
          })
        );
      }
      if (mismatch?.cancelled) {
        return failure(
          new ValidationError("Generation cancelled.", {
            reason: "CONTINUITY_BRAND_MISMATCH_CANCELLED",
          })
        );
      }
      if (mismatch?.brandConfirmed && mismatch.brandId) {
        // Tenant-checked brandId from user choice — freeze before extract/bind.
        workingMetadata = applyDirectPassthroughMetadata(
          applyConfirmedBrandId(workingMetadata, mismatch.brandId)
        );
        brandIdForUx = mismatch.brandId;
      }
    } catch {
      // Mismatch check must never break thin create when catalog/DB misbehaves.
    }
  }

  // Structured creative intent (multilingual) — before slot UX / logo attach.
  brandIdForUx =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : brandIdForUx;
  if (
    brandIdForUx &&
    prompt.trim() &&
    !logoRoleFromMetadata(workingMetadata) &&
    !conversationExecutionSpec &&
    !readExecutionSpecSnapshot(workingMetadata) &&
    !isCdfPhaseRun
  ) {
    try {
      const profile = await resolveBrandProfileContext({
        brandId: brandIdForUx,
        organizationId: trustedOrganizationId,
      });
      const rawIds = workingMetadata?.assetIds;
      const hasAttached = Array.isArray(rawIds)
        ? rawIds.length > 0
        : typeof rawIds === "string" && rawIds.trim().length > 0;
      const intent = await classifyCreativeIntent({
        integration: host.deps.integration,
        organizationId: trustedOrganizationId,
        brief: prompt,
        service:
          typeof workingMetadata?.service === "string"
            ? workingMetadata.service
            : undefined,
        subtype:
          typeof workingMetadata?.subtype === "string"
            ? workingMetadata.subtype
            : undefined,
        hasCanonicalLogo: Boolean(profile.logoAssetId?.trim()),
        hasAttachedImage: hasAttached,
        createId: host.deps.createId,
      });
      workingMetadata = applyDirectPassthroughMetadata({
        ...workingMetadata,
        ...creativeIntentMetadataExtras(intent),
      });
    } catch {
      // Intent classify must never break create.
    }
  }

  // Track A Phase A6 — product intelligence UX (slot awareness / contradictions).
  // forceStayInService still proceeds to bind below when brandId is present.

  // Multilingual brand colour / fact extraction — regex + optional LLM before continuity bind.
  // Uses confirmed brandId only — never invents / switches ownership from prompt text.
  // CDF: skip heavy CTI, but still run light brand extract when flagged.
  let prepassBrandExtract: EnrichedBrandPreferences | undefined;
  const allowLightBrandExtract =
    !isCdfPhaseRun || workingMetadata?.cdfLightBrandExtract === true;
  if (brandIdForUx && prompt.trim() && allowLightBrandExtract) {
    try {
      prepassBrandExtract = await enrichBrandPreferencesFromBrief({
        prompt,
        integration: host.deps.integration,
        organizationId: trustedOrganizationId,
        createId: host.deps.createId,
      });
      const colorExtras = metadataBrandColorExtras({
        brief: prompt,
        metadata: {
          ...workingMetadata,
          ...(prepassBrandExtract.colors?.length
            ? { brandColors: prepassBrandExtract.colors }
            : {}),
        },
      });
      if (Object.keys(colorExtras).length || prepassBrandExtract.extractionSource) {
        const extractedName = prepassBrandExtract.brandName?.trim().slice(0, 120);
        const selectedBrandId =
          typeof workingMetadata?.brandId === "string"
            ? workingMetadata.brandId.trim()
            : "";
        const existingCanonicalName =
          typeof workingMetadata?.canonicalBrandName === "string"
            ? workingMetadata.canonicalBrandName.trim()
            : typeof workingMetadata?.brandName === "string"
              ? workingMetadata.brandName.trim()
              : "";
        // Prompt extraction may enrich knowledge / reference entities, but MUST NOT
        // replace selected brand identity (brandId or canonical brandName).
        const identityMutationAttempted = Boolean(
          selectedBrandId &&
            extractedName &&
            existingCanonicalName &&
            extractedName.toLowerCase() !== existingCanonicalName.toLowerCase(),
        );
        const priorExtracted = Array.isArray(workingMetadata?.extractedBrandEntities)
          ? workingMetadata.extractedBrandEntities.filter(
              (x): x is string => typeof x === "string" && Boolean(x.trim()),
            )
          : [];
        workingMetadata = applyDirectPassthroughMetadata({
          ...workingMetadata,
          ...colorExtras,
          ...(prepassBrandExtract.extractionSource
            ? { brandExtractSource: prepassBrandExtract.extractionSource }
            : {}),
          ...(extractedName
            ? {
                extractedBrandName: extractedName,
                extractedBrandEntities: [
                  ...new Set([...priorExtracted, extractedName]),
                ],
                promptReferencedBrandNames: [
                  ...new Set([...priorExtracted, extractedName]),
                ],
                ...(identityMutationAttempted
                  ? { brandExtractAttemptedIdentityMutation: true }
                  : {}),
              }
            : {}),
          // Never overwrite selected brandName with a prompt-extracted entity.
          ...(selectedBrandId
            ? existingCanonicalName
              ? {
                  brandName: existingCanonicalName,
                  canonicalBrandName: existingCanonicalName,
                }
              : {}
            : extractedName
              ? { brandName: extractedName }
              : {}),
        });
      }
    } catch {
      // Extraction must never break thin create.
    }
  }

  if (brandIdForUx) {
    try {
      const ux = await runProductIntelligenceUx({
        brief: prompt,
        brandId: brandIdForUx,
        organizationId: trustedOrganizationId,
        metadata: workingMetadata,
      });
      if (ux) {
        if (Object.keys(ux.metadataExtras).length) {
          workingMetadata = applyDirectPassthroughMetadata({
            ...workingMetadata,
            ...ux.metadataExtras,
          });
        }
        if (ux.blockGenerate && ux.prompts.length > 0) {
          const primary = ux.prompts[0]!;
          return failure(
            new ValidationError(primary.message, {
              reason: primary.code,
              prompts: ux.prompts,
              choices: primary.choices,
              slotKey: primary.slotKey,
              details: primary.details,
              forceStayInService: workingMetadata.forceStayInService === true,
            })
          );
        }
      }
    } catch {
      // UX layer must never break thin create when flag misbehaves.
    }
  }

  // Track A Phase A2 — Intent → Resolve → Bind (flag-gated; never rewrites brief).
  // brandConfirmed freezes ownership — never rebind under a different brandId.
  const brandIdForContinuity =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  if (brandIdForContinuity) {
    try {
      const continuity = await runContinuityBindPipeline({
        brief: prompt,
        brandId: brandIdForContinuity,
        organizationId: trustedOrganizationId,
        metadata: workingMetadata,
      });
      if (continuity) {
        const logoCandidates = continuity.logoChoice?.candidates ?? [];
        if (
          logoCandidates.length > 1 &&
          continuitySlotCheckApplies(workingMetadata) &&
          (continuity.rollout === "on" || continuity.rollout === "canary")
        ) {
          const brandName = brandDisplayName(workingMetadata);
          return failure(
            new ValidationError(
              `${brandName} has ${logoCandidates.length} logos in the vault. Which one should we use?`,
              {
                reason: "CONTINUITY_LOGO_CHOICE",
                slotKey: "logo",
                choices: logoCandidates.map((candidate) => ({
                  id: `vault_logo:${candidate.assetId}`,
                  label: candidate.folder
                    ? `${candidate.name} (${candidate.folder})`
                    : candidate.name,
                })),
                details: { candidates: logoCandidates },
              }
            )
          );
        }
        if (
          continuity.needsAsk &&
          continuity.applied &&
          continuitySlotCheckApplies(workingMetadata) &&
          (continuity.rollout === "on" || continuity.rollout === "canary")
        ) {
          const { filterBlockingMissingBrandSlots } = await import(
            "../../execution/execution-input-policy"
          );
          const blockingSlots = filterBlockingMissingBrandSlots({
            missingSlots: continuity.packet.missingRequiredSlots,
            service:
              typeof workingMetadata?.service === "string"
                ? workingMetadata.service
                : undefined,
            brief: prompt,
            metadata: workingMetadata,
            executionSpec: conversationExecutionSpec,
          });
          if (blockingSlots.length === 0) {
            workingMetadata = applyDirectPassthroughMetadata({
              ...continuity.metadata,
              logoAvailable: false,
              optionalContextAvailable: false,
              continuityNeedsAsk: false,
            });
          } else if (
            blockingSlots.length === 1 &&
            blockingSlots[0] === "logo"
          ) {
            const brandName = brandDisplayName(workingMetadata);
            return failure(
              new ValidationError(
                `${brandName} doesn't have any approved logo in the vault. Upload a logo under Brand Assets first — Unagency will not invent brand identity.`,
                {
                  reason: "CONTINUITY_SLOT_MISSING",
                  missingRequiredSlots: "logo",
                  slotKey: "logo",
                }
              )
            );
          } else {
            const missing = blockingSlots.join(", ");
            return failure(
              new ValidationError(
                `Approved brand assets required but missing: ${missing}. Upload or approve them first — Unagency will not invent brand identity.`,
                { reason: "CONTINUITY_SLOT_MISSING", missingRequiredSlots: missing }
              )
            );
          }
        } else if (
          workingMetadata.continuityRefineReuse === true &&
          workingMetadata.brandContextPacket &&
          !continuity.applied
        ) {
          workingMetadata = applyDirectPassthroughMetadata(workingMetadata);
        } else {
          workingMetadata = applyDirectPassthroughMetadata(continuity.metadata);
        }
      }
    } catch {
      // Continuity must never break thin create when flag misbehaves.
    }
  }

  // Track B1 — Job Object sidecar (client sees understoodBrief; brief stays immutable).
  const brandIdForJob =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  if (brandIdForJob) {
    try {
      const profileFacts = await resolveBrandProfileFacts({
        organizationId: trustedOrganizationId,
        brandId: brandIdForJob,
      });
      const profile = brandProfileFromFacts(profileFacts);
      const job = buildJobObjectFromContext({
        userBrief: prompt,
        brandId: brandIdForJob,
        organizationId: trustedOrganizationId,
        service:
          typeof workingMetadata?.service === "string"
            ? workingMetadata.service
            : undefined,
        deliverableLabel:
          typeof workingMetadata?.deliverableLabel === "string"
            ? workingMetadata.deliverableLabel
            : undefined,
        brandName: profile.brandName,
        brandProfile: profile,
      });
      const canonicalName =
        profile.brandName?.trim() ||
        (typeof workingMetadata?.canonicalBrandName === "string"
          ? workingMetadata.canonicalBrandName.trim()
          : "") ||
        (typeof workingMetadata?.brandName === "string"
          ? workingMetadata.brandName.trim()
          : "");
      workingMetadata = applyDirectPassthroughMetadata({
        ...workingMetadata,
        ...jobObjectMetadataExtras(job),
        // Selected brand's persisted name is authoritative identity.
        ...(canonicalName
          ? {
              brandName: canonicalName,
              canonicalBrandName: canonicalName,
            }
          : {}),
        ...(profile.positioning
          ? { positioning: profile.positioning }
          : {}),
        ...(profile.voice ? { voice: profile.voice } : {}),
        ...(profile.targetAudience
          ? { targetAudience: profile.targetAudience }
          : {}),
        ...(profile.industry ? { industry: profile.industry } : {}),
      });
    } catch {
      // Job object must never break thin create.
    }
  }

  const brandIdForLogo =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  const skipVaultLogoBind =
    workingMetadata?.skipVaultLogoBind === true ||
    (typeof workingMetadata?.cdfVisualIntent === "string" &&
      /^(pack_3d|pack_flat|environment_3d|merch_mockup|merch_artwork|product_mockup|posm|illustration|storyboard_frame|ui_screen)$/i.test(
        workingMetadata.cdfVisualIntent.trim()
      ));
  if (brandIdForLogo && prompt.trim() && !skipVaultLogoBind) {
    try {
      workingMetadata = applyDirectPassthroughMetadata(
        await ensureBrandLogoInExecutionMetadata({
          organizationId: trustedOrganizationId,
          brandId: brandIdForLogo,
          metadata: workingMetadata,
          brief: prompt,
          capabilityId:
            typeof req.capabilityId === "string"
              ? req.capabilityId
              : typeof workingMetadata?.capabilityId === "string"
                ? workingMetadata.capabilityId
                : undefined,
        })
      );
    } catch {
      // Logo attach must never break create.
    }

    if (workingMetadata?.logoChoiceRequired === true) {
      const candidates = Array.isArray(workingMetadata.logoChoiceCandidates)
        ? workingMetadata.logoChoiceCandidates
        : [];
      const brandName =
        typeof workingMetadata.brandName === "string"
          ? workingMetadata.brandName.trim()
          : "Brand";
      return failure(
        new ValidationError(
          `${brandName} has ${candidates.length || "multiple"} logos. Which one should we use?`,
          {
            reason: "CONTINUITY_LOGO_CHOICE",
            slotKey: "logo",
            choices: candidates.map(
              (candidate: { assetId?: string; name?: string; folder?: string }) => ({
                id: `vault_logo:${String(candidate.assetId ?? "")}`,
                label: candidate.folder
                  ? `${candidate.name ?? "Logo"} (${candidate.folder})`
                  : String(candidate.name ?? "Logo"),
              }),
            ),
            details: { candidates },
          },
        ),
      );
    }

    const logoAssetId =
      typeof workingMetadata?.brandLogoAssetId === "string"
        ? workingMetadata.brandLogoAssetId.trim()
        : typeof workingMetadata?.logoAssetId === "string"
          ? workingMetadata.logoAssetId.trim()
          : "";
    if (conversationExecutionSpec && logoAssetId) {
      const { enrichExecutionSpecWithAuthoritativeLogo, stampAuthoritativeLogoMetadata } =
        await import(
        "../../collaboration/conversational-task-intelligence/authoritative-logo-resolver"
      );
      const logoSource =
        Array.isArray(workingMetadata?.attachmentLogoAssetIds) &&
        (workingMetadata.attachmentLogoAssetIds as unknown[]).some(
          (id) => String(id).trim() === logoAssetId,
        )
          ? ("ATTACHMENT" as const)
          : ("VAULT" as const);
      conversationExecutionSpec = enrichExecutionSpecWithAuthoritativeLogo(
        conversationExecutionSpec,
        {
          mode: "USE_EXISTING",
          assetId: logoAssetId,
          source: logoSource,
          authoritative: true,
        },
      );
      workingMetadata = stampAuthoritativeLogoMetadata(workingMetadata, {
        mode: "USE_EXISTING",
        assetId: logoAssetId,
        source: logoSource,
        authoritative: true,
      });
    }
  }

  const rawAssetIds = workingMetadata?.assetIds;
  const hasAssetIds =
    (Array.isArray(rawAssetIds) && rawAssetIds.length > 0) ||
    (typeof rawAssetIds === "string" && rawAssetIds.trim().length > 0);
  if (hasAssetIds && principal.userId) {
    try {
      workingMetadata = await attachProductAssetsToExecutionMetadata({
        userId: principal.userId,
        organizationId: trustedOrganizationId,
        metadata: workingMetadata,
      });
      workingMetadata = applyDirectPassthroughMetadata(workingMetadata);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to resolve product assets";
      return failure(new ValidationError(message));
    }
  }

  // P4.9 — artifact-grounded visual modification (reference image → image.edit).
  try {
    const visualMod = await applyVisualModificationPrepass({
      metadata: workingMetadata,
      organizationId: trustedOrganizationId,
      executionSpec: conversationExecutionSpec,
      artifactsRepo: host.deps.persistence?.artifacts,
      blobStorage: host.deps.asyncMedia?.blobStorage,
      artifactStore: host.artifactStore,
    });
    if (!visualMod.ok) {
      return failure(visualMod.error);
    }
    workingMetadata = applyDirectPassthroughMetadata(visualMod.value.metadata);
    if (visualMod.value.capabilityId) {
      capabilityIdRaw = visualMod.value.capabilityId;
      req = { ...req, capabilityId: visualMod.value.capabilityId as never };
    }
  } catch {
    // Visual modification prepass must never break unrelated creates.
  }

  // Spreadsheet output map — attach output kind metadata for provider prompt enrichment.
  // CDF execution contract is authoritative when present — product map must not
  // reinterpret text/structured phases as image (e.g. social/content-design).
  try {
    const outputSpec = resolveServiceOutputSpec({
      service:
        typeof workingMetadata?.service === "string"
          ? workingMetadata.service
          : undefined,
      subtype:
        typeof workingMetadata?.subtype === "string"
          ? workingMetadata.subtype
          : undefined,
      category:
        typeof workingMetadata?.category === "string"
          ? workingMetadata.category
          : undefined,
      prompt,
    });
    workingMetadata = {
      ...workingMetadata,
      outputKind: outputSpec.kind,
      outputModalities: [...outputSpec.modalities],
      mockupRole: outputSpec.mockupRole,
      prefers3dMockup: outputSpec.prefers3dMockup,
      needsMockup: outputSpec.needsMockup,
      needs3dMockup: outputSpec.needs3dMockup,
      exampleDeliverable: outputSpec.exampleDeliverable,
    };

    let executionSpecKindOverride: string | undefined;
    // P4.6 — deliverable-derived output kind. Product-default PNG/JPG must NOT
    // become phase-level Spec authority for incompatible intermediate CDF phases.
    if (conversationExecutionSpec?.deliverables.length) {
      const { executionSpecOutputKindOverride, deliverableToOutputKindOverride } =
        await import("../../collaboration/conversational-task-intelligence");
      const {
        resolveCdfContractFromMetadata,
        outputKindFromCdfContract,
        resolvePhaseAuthoritativeExecutionSpecOutputKind,
      } = await import("../../cdf/execution-authority");
      const serviceForSpec =
        typeof workingMetadata?.service === "string"
          ? workingMetadata.service
          : undefined;
      const allKind = executionSpecOutputKindOverride(conversationExecutionSpec, {
        service: serviceForSpec,
      });
      const explicitDeliverables = conversationExecutionSpec.deliverables.filter(
        (d) => d.provenance?.explicit === true,
      );
      const explicitKind = explicitDeliverables.length
        ? deliverableToOutputKindOverride(explicitDeliverables, {
            service: serviceForSpec,
          })
        : undefined;
      const cdfContract = resolveCdfContractFromMetadata(
        workingMetadata as Record<string, unknown>,
      );
      const cdfKind = cdfContract
        ? outputKindFromCdfContract(cdfContract)
        : undefined;
      const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
        cdfOutputKind: cdfKind,
        deliverables: conversationExecutionSpec.deliverables,
        outputKindFromAllDeliverables: allKind,
        outputKindFromExplicitDeliverables: explicitKind,
      });
      workingMetadata = {
        ...workingMetadata,
        cdfExecutionSpecKindAuthority: scoped.authority,
        ...(scoped.deferredProductOutputKind
          ? {
              cdfDeferredProductOutputKind: scoped.deferredProductOutputKind,
            }
          : {}),
      };
      if (scoped.executionSpecOutputKind) {
        executionSpecKindOverride = scoped.executionSpecOutputKind;
        workingMetadata = {
          ...workingMetadata,
          outputKind: scoped.executionSpecOutputKind,
        };
      }
      if (conversationExecutionSpec.outputIntent.mode.value === "FINAL") {
        workingMetadata = {
          ...workingMetadata,
          executionSpecFinalMode: true,
          executionSpecQuantity: conversationExecutionSpec.content.quantity?.value ?? 1,
        };
      }
    }

    {
      const { applyCdfExecutionAuthority } = await import(
        "../../cdf/execution-authority"
      );
      const authority = applyCdfExecutionAuthority({
        metadata: workingMetadata as Record<string, unknown>,
        proposedOutputKind:
          typeof workingMetadata?.outputKind === "string"
            ? workingMetadata.outputKind
            : undefined,
        executionSpecOutputKind: executionSpecKindOverride,
      });
      // CDF remains authoritative even when Spec is incompatible. Structured
      // conflict is stamped on metadata (deferredConflict) — do not block the
      // phase create or allow Spec to rewrite sealed fields.
      if (!authority.ok) {
        // Defensive: applyCdfExecutionAuthority soft-defers Spec conflicts.
        // If a hard fail ever returns, still refuse to let Spec win by
        // re-applying without Spec kind rather than aborting the CDF spine.
        const sealed = applyCdfExecutionAuthority({
          metadata: workingMetadata as Record<string, unknown>,
          proposedOutputKind:
            typeof workingMetadata?.outputKind === "string"
              ? workingMetadata.outputKind
              : undefined,
          executionSpecOutputKind: undefined,
        });
        if (sealed.ok) {
          workingMetadata = {
            ...sealed.metadata,
            cdfExecutionSpecConflict: true,
            cdfExecutionSpecConflictCode: authority.code,
            cdfExecutionSpecConflictMessage: authority.message,
            cdfExecutionSpecConflictDetails: authority.details,
            cdfDeferredIncompatibleSpecOutputKind:
              authority.details.executionSpecOutputKind,
          };
        } else {
          return failure(
            new ValidationError(authority.message, {
              code: authority.code,
              ...authority.details,
            }),
          );
        }
      } else {
        workingMetadata = authority.metadata;
      }
      if (
        workingMetadata?.cdfExecutionAuthorityApplied === true &&
        typeof workingMetadata.capabilityId === "string" &&
        workingMetadata.capabilityId.trim()
      ) {
        capabilityIdRaw = String(workingMetadata.capabilityId);
        req = {
          ...req,
          capabilityId: workingMetadata.capabilityId as never,
        };
      }
    }

    // Phase 2 / Phase 10 — Canonical Generation Context via Context Orchestrator
    // (flag OFF = no-op). Must run before PresentationRouteConcepts stamp.
    {
      const {
        isCdfCanonicalGenerationContextEnabled,
        hasCdfSessionPhaseMetadata,
        CDF_CANONICAL_CONTEXT_META,
      } = await import("../../cdf/generation-context");
      const { orchestrateCanonicalGenerationContext } = await import(
        "../../ai/context-orchestrator"
      );
      let conversationMessages:
        | import("../../ai/conversation-working-memory").WorkingMemorySourceMessage[]
        | undefined;
      let handoffObs: Record<string, unknown> = {
        conversationIdPresent: false,
        channelIdPresent: false,
        conversationContextAvailable: false,
        conversationMessageCountLoaded: 0,
      };
      // Phase 7/7A — light load of recent Collaboration OS messages for working memory
      // (no CTI classify / no second store). Active when flag ON or contract-canonical.
      const strategyCanonical =
        typeof workingMetadata?.cdfExecutionStrategy === "string" &&
        workingMetadata.cdfExecutionStrategy === "canonical";
      const contractForcesCanonical =
        hasCdfSessionPhaseMetadata(workingMetadata) && strategyCanonical;
      if (
        (isCdfCanonicalGenerationContextEnabled() || contractForcesCanonical) &&
        hasCdfSessionPhaseMetadata(workingMetadata)
      ) {
        // Framework: hydrate CDF session + requirement bag (ActiveBrief X@V)
        // before sync context resolution. Required after backend restart.
        const cdfSessionIdRaw = workingMetadata.cdfSessionId;
        if (typeof cdfSessionIdRaw === "string" && cdfSessionIdRaw.trim()) {
          const { ensureCdfSessionLoaded } = await import("../../cdf");
          await ensureCdfSessionLoaded(cdfSessionIdRaw.trim());
        }
        const {
          resolveWorkingMemoryConversationHandoff,
          workingMemoryHandoffObservability,
        } = await import("../../cdf/generation-context/resolve-conversation-handoff");
        const handoff = resolveWorkingMemoryConversationHandoff(workingMetadata);
        const userId = principal.userId?.trim();
        let messageCountLoaded = 0;
        // storeHandle = channelId (roomKey) OR conversationId (ObjectId).
        // collaborationOsService.resolveConversation accepts both.
        if (handoff.storeHandle && userId) {
          try {
            const { serviceConversationService } = await import(
              "../../collaboration/service-conversation-service"
            );
            const { DEFAULT_WORKING_MEMORY_BOUNDS } = await import(
              "../../ai/conversation-working-memory"
            );
            conversationMessages = await serviceConversationService.listMessages({
              userId,
              channelId: handoff.storeHandle,
              limit: DEFAULT_WORKING_MEMORY_BOUNDS.candidateWindow,
            });
            messageCountLoaded = conversationMessages.length;
          } catch {
            // Working memory is optional evidence — never block generation.
            conversationMessages = undefined;
            messageCountLoaded = 0;
          }
        }
        handoffObs = workingMemoryHandoffObservability({
          handoff,
          messageCountLoaded,
        });
        workingMetadata = {
          ...workingMetadata,
          [CDF_CANONICAL_CONTEXT_META.conversationIdPresent]:
            handoffObs.conversationIdPresent,
          [CDF_CANONICAL_CONTEXT_META.channelIdPresent]:
            handoffObs.channelIdPresent,
          [CDF_CANONICAL_CONTEXT_META.conversationContextAvailable]:
            handoffObs.conversationContextAvailable,
          [CDF_CANONICAL_CONTEXT_META.conversationMessageCountLoaded]:
            handoffObs.conversationMessageCountLoaded,
        };
      }

      // Exact selected upstream visual → multimodal bytes (after session hydrate).
      // Fail closed rather than text-only continuity for visual emission phases.
      {
        const { applyGenerationContinuationVisualPrepass } = await import(
          "./apply-generation-continuation-visual-prepass"
        );
        const modalityHint =
          typeof workingMetadata?.cdfGenerationModality === "string"
            ? workingMetadata.cdfGenerationModality.trim()
            : typeof workingMetadata?.preferredVisualModality === "string"
              ? workingMetadata.preferredVisualModality.trim()
              : typeof workingMetadata?.outputKind === "string"
                ? workingMetadata.outputKind.trim()
                : "";
        const looksVisualEmission =
          modalityHint === "image" ||
          modalityHint === "video" ||
          modalityHint === "edited_image" ||
          modalityHint === "image_mockup" ||
          modalityHint === "image_3d_mockup" ||
          Boolean(workingMetadata?.cdfContinuationVisualArtifactId) ||
          Boolean(workingMetadata?.cdfGenerationContinuation);
        const contVisual = await applyGenerationContinuationVisualPrepass({
          metadata: workingMetadata,
          organizationId: trustedOrganizationId,
          projectId:
            typeof req.projectId === "string" ? req.projectId : undefined,
          artifactsRepo: host.deps.persistence?.artifacts,
          blobStorage: host.deps.asyncMedia?.blobStorage,
          artifactStore: host.artifactStore,
          requireResolvedVisual: looksVisualEmission,
        });
        if (!contVisual.ok) {
          return failure(contVisual.error);
        }
        workingMetadata = applyDirectPassthroughMetadata(
          contVisual.value.metadata,
        );
      }

      // Generic upstream visual ArtifactVersion handoff (approved/selected deps).
      // IMAGE→VIDEO / IMAGE→IMAGE: exact X@V vault media → metadata.assets → CMR.
      {
        const { applyUpstreamVisualArtifactHandoff } = await import(
          "../../cdf/generation-context/upstream-visual-handoff"
        );
        const upstreamVisual = await applyUpstreamVisualArtifactHandoff({
          metadata: workingMetadata,
          organizationId: trustedOrganizationId,
          projectId:
            typeof req.projectId === "string" ? req.projectId : undefined,
        });
        if (!upstreamVisual.ok) {
          return failure(upstreamVisual.error);
        }
        workingMetadata = applyDirectPassthroughMetadata(
          upstreamVisual.value.metadata,
        );
        if (upstreamVisual.value.attachedCount > 0) {
          try {
            console.info(
              JSON.stringify({
                scope: "cdf.upstream_artifact",
                event: "provider_boundary",
                executionId:
                  typeof workingMetadata.executionId === "string"
                    ? workingMetadata.executionId
                    : null,
                cdfSessionId: workingMetadata.cdfSessionId ?? null,
                targetPhase: workingMetadata.cdfPhaseId ?? null,
                attachedCount: upstreamVisual.value.attachedCount,
                provider_received_upstream_visual: true,
                ts: new Date().toISOString(),
              }),
            );
          } catch {
            // ignore
          }
        }
      }

      const { resolveCanonicalConversationalInstruction } = await import(
        "../../ai/conversational-runtime"
      );
      const applied = orchestrateCanonicalGenerationContext({
        prompt,
        metadata: workingMetadata,
        organizationId: trustedOrganizationId,
        projectId:
          typeof req.projectId === "string" ? req.projectId : undefined,
        conversationalInstruction:
          resolveCanonicalConversationalInstruction(workingMetadata),
        conversationMessages,
      });
      if (!applied.ok) {
        return failure(
          new ValidationError(applied.message, {
            reason: applied.code,
            ...(applied.details ?? {}),
          }),
        );
      }
      prompt = applied.prompt;
      workingMetadata = applied.metadata;
      req = { ...req, prompt, metadata: workingMetadata };
    }

    const clientStructuredName =
      req.structuredOutput &&
      typeof req.structuredOutput === "object" &&
      typeof req.structuredOutput.name === "string"
        ? req.structuredOutput.name
        : "";
    const isMediaCapability =
      isImageGenerationCapability(capabilityIdRaw) ||
      isVideoGenerationCapability(capabilityIdRaw);
    // Prefer CDF-authoritative outputKind after applyCdfExecutionAuthority —
    // product-map outputSpec.kind may still say "image" for social/content-design.
    const authoritativeKind =
      typeof workingMetadata?.outputKind === "string"
        ? workingMetadata.outputKind
        : outputSpec.kind;
    const isVisualDeliverableKind =
      authoritativeKind === "image" ||
      authoritativeKind === "video" ||
      authoritativeKind === "edited_image" ||
      authoritativeKind === "animation" ||
      authoritativeKind === "image_mockup" ||
      authoritativeKind === "image_3d_mockup";
    const needsPresentationExpand =
      !isMediaCapability &&
      !isVisualDeliverableKind &&
      (authoritativeKind === "presentation" ||
        clientStructuredName === "PresentationRouteConcepts" ||
        workingMetadata?.cdfCanonicalFullDeck === true);
    const omitCdfStructured = shouldOmitCdfStructuredStamp(workingMetadata);
    const canonicalFullDeck =
      workingMetadata?.cdfCanonicalFullDeck === true ||
      workingMetadata?.cdfOmitConceptsExpansion === true;
    const cdfAuthoritySealed =
      workingMetadata?.cdfExecutionAuthorityApplied === true;
    if (needsPresentationExpand && !omitCdfStructured) {
      const subtype =
        typeof workingMetadata?.subtype === "string"
          ? workingMetadata.subtype.trim().toLowerCase()
          : "";
      // Configure expansion behavior from authoritative kind — never rewrite
      // outputKind after CDF authority has sealed it.
      workingMetadata = {
        ...workingMetadata,
        presentationExpandMode: canonicalFullDeck
          ? "canonical"
          : subtype === "gifs"
            ? "lazy"
            : "full",
        deliverableRequired: subtype !== "gifs",
      };
      // Non-CDF / unsealed: stamp presentation schemas. CDF sealed path relies
      // on stampCanonicalStructuredOutputMetadata from the phase contract.
      if (!cdfAuthoritySealed && subtype !== "gifs") {
        const structuredOutput = canonicalFullDeck
          ? {
              name: "PresentationRoutes",
              schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
                string,
                unknown
              >,
              strict: true,
            }
          : {
              name: "PresentationRouteConcepts",
              schema: PRESENTATION_ROUTE_CONCEPTS_SCHEMA as unknown as Record<
                string,
                unknown
              >,
              strict: true,
            };
        req = { ...req, structuredOutput };
        workingMetadata = {
          ...workingMetadata,
          structuredOutput,
        };
      }
    }

    // Web Tech — configure WebsiteRoutes only when authoritative kind is website.
    // Never force outputKind from product catalog after CDF authority.
    if (
      authoritativeKind === "deferred_website" &&
      !omitCdfStructured &&
      !cdfAuthoritySealed
    ) {
      const structuredOutput = {
        name: "WebsiteRoutes",
        schema: WEBSITE_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        strict: true,
      };
      req = { ...req, structuredOutput };
      workingMetadata = {
        ...workingMetadata,
        structuredOutput,
      };
    }
  } catch {
    // Non-fatal.
  }

  const serviceSlug =
    typeof workingMetadata?.service === "string"
      ? workingMetadata.service.toLowerCase()
      : "";
  const outputKindSlug =
    typeof workingMetadata?.outputKind === "string"
      ? workingMetadata.outputKind.toLowerCase()
      : "";
  // Non-CDF website correction only — sealed CDF capability already set.
  if (
    workingMetadata?.cdfExecutionAuthorityApplied !== true &&
    (serviceSlug === "website" ||
      outputKindSlug === "deferred_website" ||
      outputKindSlug === "website") &&
    (isImageGenerationCapability(capabilityIdRaw) ||
      isVideoGenerationCapability(capabilityIdRaw))
  ) {
    capabilityIdRaw = "text.generate";
    req = { ...req, capabilityId: "text.generate" };
    workingMetadata = { ...workingMetadata, forcedTextForWebTech: true };
  }

  const clientRoutingPin = resolveClientRoutingPin(req, workingMetadata);

  // Fanout leaves: GenerationFanoutContract leaf metadata is routing authority.
  // Never proceed with provider-only pins — dual-OpenAI leaves share providerId.
  if (
    isGenerationFanoutLeafMetadata(workingMetadata) &&
    isImageGenerationCapability(capabilityIdRaw)
  ) {
    const leafProvider =
      clientRoutingPin.providerId ||
      (typeof workingMetadata?.preferredProviderId === "string"
        ? workingMetadata.preferredProviderId.trim()
        : "") ||
      (typeof workingMetadata?.requestedProvider === "string"
        ? workingMetadata.requestedProvider.trim()
        : "");
    const leafModel =
      clientRoutingPin.modelId ||
      (typeof workingMetadata?.preferredModelId === "string"
        ? workingMetadata.preferredModelId.trim()
        : "") ||
      (typeof workingMetadata?.requestedModel === "string"
        ? workingMetadata.requestedModel.trim()
        : "");
    if (!leafProvider || !leafModel) {
      return failure(
        new ValidationError(
          "Fanout leaf requires preferredProviderId and preferredModelId (or requestedProvider/requestedModel) — provider-only routing collapses dual-family leaves",
          {
            reason: "FANOUT_LEAF_MODEL_REQUIRED",
            generationFanoutTargetId:
              typeof workingMetadata?.generationFanoutTargetId === "string"
                ? workingMetadata.generationFanoutTargetId
                : undefined,
            preferredProviderId: leafProvider || undefined,
            preferredModelId: leafModel || undefined,
          },
        ),
      );
    }
    // Re-stamp authority pins before router so drops cannot become matrix first-match.
    workingMetadata = {
      ...workingMetadata,
      preferredProviderId: leafProvider,
      preferredModelId: leafModel,
      requestedProvider: leafProvider,
      requestedModel: leafModel,
      generationFanoutLeaf: true,
      disableCrossProviderFailover: true,
    };
  }

  // Re-lift pins after fanout authority re-stamp (preferred* may have been restored).
  const routingPin = resolveClientRoutingPin(req, workingMetadata);
  // Routing contract: a required provider pin forbids provider substitution.
  workingMetadata = {
    ...workingMetadata,
    ...providerPinMetadataStamps({
      policy: parseProviderPinPolicy(
        req.providerPinPolicy ?? workingMetadata?.providerPinPolicy,
      ),
      pinnedProviderId: routingPin.providerId,
    }),
  };

  // Matrix model routing — single router ownership for create (Wave 3).
  // Pins preferredProviderId / preferredModelId on workingMetadata; async/sync
  // dispatch must honor those pins and not re-route when both are present.
  if (isImageGenerationCapability(capabilityIdRaw) && host.deps.imageRouter) {
    const routeVisualSlot =
      typeof workingMetadata?.routeVisualSlot === "number"
        ? workingMetadata.routeVisualSlot
        : typeof workingMetadata?.routeVisualSlot === "string"
          ? Number.parseInt(workingMetadata.routeVisualSlot, 10)
          : undefined;
    const logoBound =
      workingMetadata?.referenceInputPresent === true ||
      (typeof workingMetadata?.brandLogoAssetId === "string" &&
        workingMetadata.brandLogoAssetId.trim().length > 0) ||
      (typeof workingMetadata?.logoAssetId === "string" &&
        workingMetadata.logoAssetId.trim().length > 0) ||
      (Array.isArray(workingMetadata?.assetIds) &&
        workingMetadata.assetIds.length > 0);
    const routed = await routeImageWithReferenceSupport({
      metadata: workingMetadata ?? {},
      prompt,
      capabilityId: capabilityIdRaw || "image.generate",
      imageRouter: host.deps.imageRouter,
      preferredProviderId: routingPin.providerId,
      preferredModelId: routingPin.modelId,
      // Slot fan-out reintroduces OpenAI/Recraft — skip when a logo is bound.
      ...(!logoBound && Number.isFinite(routeVisualSlot)
        ? { routeVisualSlot }
        : {}),
      ...(typeof workingMetadata?.service === "string"
        ? { service: workingMetadata.service }
        : {}),
      ...(typeof workingMetadata?.platform === "string"
        ? { platform: workingMetadata.platform }
        : {}),
      ...(typeof workingMetadata?.subtype === "string"
        ? { subtype: workingMetadata.subtype }
        : {}),
    });
    if (!routed.ok) {
      return failure(routed.error);
    }
    workingMetadata = {
      ...routed.value.metadata,
      imageUseCase:
        typeof workingMetadata?.imageUseCase === "string"
          ? workingMetadata.imageUseCase
          : undefined,
    };

    // Composition → capability requirements (generic; no service/platform branches).
    let capabilityRequirements = null as
      | import("../../cdf/generation-context/execution-capability-requirements").ExecutionCapabilityRequirements
      | null;
    try {
      const serviceId =
        typeof workingMetadata?.cdfServiceId === "string"
          ? workingMetadata.cdfServiceId
          : typeof workingMetadata?.serviceId === "string"
            ? workingMetadata.serviceId
            : "";
      const phaseId =
        typeof workingMetadata?.cdfPhaseId === "string"
          ? workingMetadata.cdfPhaseId
          : "";
      if (serviceId && phaseId) {
        const { resolveDeliverableCompositionForPhase } = await import(
          "../../cdf/generation-context/resolve-deliverable-composition"
        );
        const { deriveExecutionCapabilityRequirements } = await import(
          "../../cdf/generation-context/execution-capability-requirements"
        );
        const resolved = resolveDeliverableCompositionForPhase({
          serviceId,
          phaseId,
          service:
            typeof workingMetadata?.service === "string"
              ? workingMetadata.service
              : null,
          subtype:
            typeof workingMetadata?.subtype === "string"
              ? workingMetadata.subtype
              : null,
          productKey:
            typeof workingMetadata?.productKey === "string"
              ? workingMetadata.productKey
              : typeof workingMetadata?.productPath === "string"
                ? workingMetadata.productPath
                : null,
        });
        if (resolved.contract) {
          capabilityRequirements = deriveExecutionCapabilityRequirements(
            resolved.contract,
          );
        }
      }
    } catch {
      capabilityRequirements = null;
    }

    const matrixRoute = host.deps.imageRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "image.generate",
      preferredProviderId: routed.value.providerId,
      preferredModelId: routed.value.modelId,
      ...(!logoBound && Number.isFinite(routeVisualSlot)
        ? { routeVisualSlot }
        : {}),
      ...(typeof workingMetadata?.service === "string"
        ? { service: workingMetadata.service }
        : {}),
      ...(typeof workingMetadata?.platform === "string"
        ? { platform: workingMetadata.platform }
        : {}),
      ...(typeof workingMetadata?.subtype === "string"
        ? { subtype: workingMetadata.subtype }
        : {}),
      ...(capabilityRequirements
        ? { capabilityRequirements }
        : {}),
    });
    if (matrixRoute.ok) {
      const { listReferenceImageProviderIds } = await import(
        "../../providers/image/configs/image-provider-capabilities"
      );
      const refCapable = new Set(listReferenceImageProviderIds());
      const fanoutLeaf = isGenerationFanoutLeafMetadata(workingMetadata);
      // Fanout leaves: intra-leaf same-provider model fallback only — never sibling families.
      const failoverChain = fanoutLeaf
        ? resolveIntraLeafFailoverChain({
            primaryProviderId: String(
              routed.value.providerId ??
                workingMetadata?.preferredProviderId ??
                "",
            ),
            primaryModelId: String(
              routed.value.modelId ?? workingMetadata?.preferredModelId ?? "",
            ),
            matrixChain: matrixRoute.value.failoverChain,
            excludeModelKeys: new Set(
              Array.isArray(workingMetadata?.generationFanoutSiblingModelKeys)
                ? (workingMetadata.generationFanoutSiblingModelKeys as unknown[])
                    .filter((k): k is string => typeof k === "string")
                : [],
            ),
          })
        : logoBound
          ? matrixRoute.value.failoverChain.filter((step) =>
              refCapable.has(step.providerId),
            )
          : matrixRoute.value.failoverChain;
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        imageUseCase: matrixRoute.value.useCase,
        imageProviderLabel: matrixRoute.value.label,
        ...(capabilityRequirements
          ? {
              cdfExecutionCapabilityRequirements: capabilityRequirements,
            }
          : {}),
        ...(failoverChain.length
          ? { imageFailoverChain: failoverChain }
          : { imageFailoverChain: [] }),
        ...(fanoutLeaf
          ? {
              disableCrossProviderFailover: true,
              generationFanoutLeaf: true,
              // Declared leaf identity survives resolved-model updates.
              requestedProvider: String(
                workingMetadata?.requestedProvider ??
                  routed.value.providerId ??
                  "",
              ),
              requestedModel: String(
                workingMetadata?.requestedModel ?? routed.value.modelId ?? "",
              ),
            }
          : {}),
      };
    }
  } else if (
    isVideoGenerationCapability(capabilityIdRaw) &&
    host.deps.videoRouter
  ) {
    const routed = await host.deps.videoRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "video.generate",
      preferredProviderId: routingPin.providerId,
      preferredModelId: routingPin.modelId,
      ...(typeof workingMetadata?.service === "string"
        ? { service: workingMetadata.service }
        : {}),
      ...(typeof workingMetadata?.platform === "string"
        ? { platform: workingMetadata.platform }
        : {}),
      ...(typeof workingMetadata?.subtype === "string"
        ? { subtype: workingMetadata.subtype }
        : {}),
    });
    if (routed.ok) {
      const fanoutLeaf = isGenerationFanoutLeafMetadata(workingMetadata);
      // Fanout leaves: intra-leaf same-provider model fallback only (parity with image).
      const videoIntraLeafChain = fanoutLeaf
        ? resolveIntraLeafFailoverChain({
            primaryProviderId: String(routed.value.providerId ?? ""),
            primaryModelId: String(routed.value.modelId ?? ""),
            declaredModelIds:
              INTRA_PROVIDER_VIDEO_MODEL_FALLBACKS[
                String(routed.value.providerId ?? "")
              ] ?? [],
          })
        : null;
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        videoUseCase: routed.value.capabilityId,
        videoProviderLabel: routed.value.providerId,
        ...(fanoutLeaf
          ? {
              imageFailoverChain: videoIntraLeafChain ?? [],
              disableCrossProviderFailover: true,
              generationFanoutLeaf: true,
            }
          : {}),
      };
    }
  } else if (
    isAudioSynthesizeCapability(capabilityIdRaw) &&
    host.deps.audioRouter
  ) {
    const routed = host.deps.audioRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "audio.synthesize",
      preferredProviderId: routingPin.providerId,
      preferredModelId: routingPin.modelId,
      ...(typeof workingMetadata?.service === "string"
        ? { service: workingMetadata.service }
        : {}),
      ...(typeof workingMetadata?.platform === "string"
        ? { platform: workingMetadata.platform }
        : {}),
      ...(typeof workingMetadata?.subtype === "string"
        ? { subtype: workingMetadata.subtype }
        : {}),
    });
    if (routed.ok) {
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        audioUseCase: routed.value.useCase,
        audioProviderLabel: routed.value.label,
      };
    }
  } else if (isAudioTranscribeCapability(capabilityIdRaw)) {
    // No matrix STT router yet — pin OpenAI Whisper (only verified audio.transcribe leaf).
    const existingProvider =
      typeof workingMetadata?.preferredProviderId === "string"
        ? workingMetadata.preferredProviderId.trim()
        : "";
    const existingModel =
      typeof workingMetadata?.preferredModelId === "string"
        ? workingMetadata.preferredModelId.trim()
        : "";
    workingMetadata = {
      ...workingMetadata,
      preferredProviderId:
        routingPin.providerId || existingProvider || "provider.openai",
      preferredModelId: routingPin.modelId || existingModel || "whisper-1",
    };
  } else if (
    host.deps.textRouter &&
    !isImageGenerationCapability(capabilityIdRaw) &&
    !isVideoGenerationCapability(capabilityIdRaw) &&
    !isAudioSynthesizeCapability(capabilityIdRaw) &&
    !isAudioTranscribeCapability(capabilityIdRaw)
  ) {
    const routed = host.deps.textRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "text.generate",
      preferredProviderId: routingPin.providerId,
      preferredModelId: routingPin.modelId,
      metadata: workingMetadata,
    });
    if (routed.ok) {
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        textUseCase: routed.value.useCase,
        textProviderLabel: routed.value.label,
        ...(routed.value.failoverChain.length
          ? { failoverChain: routed.value.failoverChain.slice(0, 4) }
          : {}),
      };
    }
  }

  const providerPrompt = sanitizePassthroughPrompt(prompt);

  // Ownership lock: confirmed brandId must survive any later metadata merges.
  if (
    workingMetadata?.brandConfirmed === true &&
    typeof workingMetadata.brandId === "string" &&
    workingMetadata.brandId.trim()
  ) {
    workingMetadata = applyDirectPassthroughMetadata(
      applyConfirmedBrandId(workingMetadata, workingMetadata.brandId.trim())
    );
  }

  workingMetadata = stampCanonicalStructuredOutputMetadata(
    stampEmailCreateMetadata(
      stampDocumentCreateMetadata(stampPresentationCreateMetadata(workingMetadata))
    )
  );

  // Seal: no post-authority stamp may leave mutated semantic fields.
  {
    const { reassertCdfExecutionAuthority } = await import(
      "../../cdf/execution-authority"
    );
    workingMetadata = reassertCdfExecutionAuthority(workingMetadata);
    if (
      typeof workingMetadata.capabilityId === "string" &&
      workingMetadata.capabilityId.trim()
    ) {
      capabilityIdRaw = String(workingMetadata.capabilityId);
    }
  }

  const mediaSanitized = sanitizeMediaGenerationCreateMetadata({
    metadata: workingMetadata,
    capabilityId: capabilityIdRaw,
    structuredOutput: req.structuredOutput,
  });
  workingMetadata = mediaSanitized.metadata;
  {
    const { reassertCdfExecutionAuthority } = await import(
      "../../cdf/execution-authority"
    );
    workingMetadata = reassertCdfExecutionAuthority(workingMetadata);
    if (
      typeof workingMetadata.capabilityId === "string" &&
      workingMetadata.capabilityId.trim()
    ) {
      capabilityIdRaw = String(workingMetadata.capabilityId);
    }
  }

  req = {
    ...req,
    prompt: providerPrompt,
    metadata: workingMetadata,
    ...(typeof workingMetadata?.preferredProviderId === "string"
      ? { providerId: workingMetadata.preferredProviderId }
      : {}),
    ...(typeof workingMetadata?.preferredModelId === "string"
      ? { modelId: workingMetadata.preferredModelId }
      : {}),
    ...(mediaSanitized.structuredOutput
      ? {
          structuredOutput:
            mediaSanitized.structuredOutput as CreateExecutionRequest["structuredOutput"],
        }
      : {}),
  };

  const requestFingerprint = JSON.stringify({
    prompt: req.prompt,
    projectId: req.projectId,
    brandId:
      typeof req.metadata?.brandId === "string" ? req.metadata.brandId : undefined,
    capabilityId: req.capabilityId,
  });

  if (req.idempotencyKey?.trim()) {
    const idemStoreKey = `${trustedOrganizationId}:${req.idempotencyKey.trim()}`;
    if (host.deps.persistence) {
      if (!host.deps.persistence.idempotency.isAvailable()) {
        return failure(
          new ValidationError(
            "idempotency store unavailable — refusing duplicate-unsafe request (fail-closed)"
          )
        );
      }
    }
    const prior = host.deps.persistence
      ? await host.deps.persistence.idempotency.get(idemStoreKey)
      : host.idempotencyIndex.get(idemStoreKey);
    if (prior) {
      if (prior.fingerprint !== requestFingerprint) {
        return failure(
          new ValidationError("idempotency key reused with different payload")
        );
      }
      const existing = await host.loadExecution(prior.executionId);
      if (existing) {
        return success({ kind: "done", resource: existing });
      }
    }
  }

  const tenantTokenCeiling = Number(
    process.env.ENTERPRISE_API_TENANT_TOKEN_CEILING ?? 0
  );
  if (tenantTokenCeiling > 0) {
    if (host.deps.persistence && !host.deps.persistence.tenantUsage.isAvailable()) {
      return failure(
        new ValidationError(
          "tenant usage store unavailable — refusing unbounded LIVE traffic (fail-closed)"
        )
      );
    }
    const used = host.deps.persistence
      ? await host.deps.persistence.tenantUsage.getTokensUsed(trustedOrganizationId)
      : host.tenantTokenUsage.get(trustedOrganizationId) ?? 0;
    if (used >= tenantTokenCeiling) {
      return failure(new ValidationError("tenant token budget exceeded"));
    }
  }

  const executionId = host.deps.createId("exec");
  const correlationId = host.deps.createId("corr");
  const now = host.deps.nowIso();

  try {
    const { applyExecutionSpecHandoff } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-handoff"
    );
    workingMetadata = await applyExecutionSpecHandoff({
      host,
      executionId,
      metadata: workingMetadata,
      conversationSpec: conversationExecutionSpec,
    });
  } catch {
    // Spec handoff must never block generation.
  }

  // Phase 1 — Format & Production Spec instruct: stamp binding + inject into provider prompt.
  // Phase 5 — when canonical CMR assembly is complete, stamp binding only (no prompt append).
  let providerPromptAfterSpec = providerPrompt;
  try {
    const { ensureProviderPromptHasProductionSpec, applyProductionSpecInstructToMetadata } =
      await import("../../config/format-production-spec");
    const { shouldSkipEffectiveInstructionPromptReplace } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-handoff"
    );
    const skipPostCmr =
      workingMetadata.cdfSkipPostCmrPromptAppends === true ||
      workingMetadata.cdfCanonicalAssemblyComplete === true ||
      workingMetadata.cdfCanonicalContextApplied === true;

    if (skipPostCmr) {
      const metaOnly = applyProductionSpecInstructToMetadata(workingMetadata, {
        force: true,
        boundAt: now,
      });
      workingMetadata = metaOnly.metadata;
      // Keep placeholder / CMR prompt untouched — Spec lives inside CMR.
      providerPromptAfterSpec = providerPrompt;
      req = { ...req, metadata: workingMetadata };
    } else {
      const applied = ensureProviderPromptHasProductionSpec({
        prompt: providerPrompt,
        metadata: workingMetadata,
        boundAt: now,
      });
      workingMetadata = applied.metadata;
      providerPromptAfterSpec = applied.prompt;

      // Prefer stamped effective instruction when Spec handoff enriched it and
      // we are not on a route-visual passthrough that must keep the leaf prompt.
      if (!shouldSkipEffectiveInstructionPromptReplace(workingMetadata)) {
        const effective =
          typeof workingMetadata.conversationalEffectiveInstruction === "string"
            ? workingMetadata.conversationalEffectiveInstruction.trim()
            : "";
        if (
          effective &&
          effective !== providerPromptAfterSpec &&
          effective.includes("[production_constraints]") ||
          effective.includes("[Format Production Spec]") ||
          effective.includes("[UNAGENCY Production Spec]")
        ) {
          providerPromptAfterSpec = effective;
        }
      }

      if (providerPromptAfterSpec !== providerPrompt) {
        providerPromptAfterSpec = sanitizePassthroughPrompt(providerPromptAfterSpec);
        req = { ...req, prompt: providerPromptAfterSpec, metadata: workingMetadata };
      } else {
        req = { ...req, metadata: workingMetadata };
      }
    }
  } catch {
    // Production Spec instruct must never block generation.
  }

  // Phase 5 — R/H pre-gen hold (blocks spend when enforce rollout is active).
  try {
    const {
      evaluateProductionPregenHold,
      readConfirmedOverrideFromMetadata,
      resolveProductionInstructInputFromMetadata,
    } = await import("../../config/format-production-spec");
    const pregen = evaluateProductionPregenHold({
      ...resolveProductionInstructInputFromMetadata(workingMetadata),
      confirmedOverride: readConfirmedOverrideFromMetadata(workingMetadata),
      organizationId: trustedOrganizationId,
      executionId,
      requestId: executionId,
    });
    if (pregen.blocked) {
      return failure(
        new ValidationError(
          pregen.reason ??
            "Production Spec pre-gen hold: confirmedOverride required for R/H placement",
        ),
      );
    }
  } catch {
    // Pregen evaluation errors must not block generation.
  }

  // P4.9.4 — canonical website brief on execution metadata for materialization relevance.
  try {
    const { isWebsiteGenerationMetadata } = await import("./execution-thin-path");
    const { resolveBriefObjectiveFromMetadata } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-snapshot"
    );
    const { extractWebsiteBrandName } = await import(
      "../../os/delivery/website-generation"
    );
    if (isWebsiteGenerationMetadata(workingMetadata)) {
      const websiteBrief =
        (typeof workingMetadata?.websiteUserBrief === "string" &&
          workingMetadata.websiteUserBrief.trim()) ||
        resolveBriefObjectiveFromMetadata(workingMetadata, prompt) ||
        prompt.trim();
      if (websiteBrief) {
        const brandFromBrief = extractWebsiteBrandName(websiteBrief);
        workingMetadata = {
          ...workingMetadata,
          websiteUserBrief: websiteBrief,
          ...(brandFromBrief && !workingMetadata?.requiredBrandName
            ? {
                requiredBrandName: brandFromBrief,
                brandName:
                  typeof workingMetadata?.brandName === "string" &&
                  workingMetadata.brandName.trim()
                    ? workingMetadata.brandName
                    : brandFromBrief,
              }
            : {}),
        };
      }
    }
  } catch {
    // Website brief stamping must never block generation.
  }

  const brandIdForLearn =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  if (brandIdForLearn && prompt.trim() && !isCdfPhaseRun) {
    let learnPrefs: ProductBrandPreferences | undefined;
    if (prepassBrandExtract) {
      const { extractionSource: _ignored, ...rest } = prepassBrandExtract as ProductBrandPreferences & {
        extractionSource?: string;
      };
      learnPrefs = rest;
    }
    scheduleLearnBrandKnowledgeFromPromptUntrusted({
      organizationId: trustedOrganizationId,
      brandId: brandIdForLearn,
      prompt,
      source: "execution_create",
      ...(learnPrefs ? { preExtracted: learnPrefs } : {}),
      integration: host.deps.integration,
    });
  }

  const adaptiveApplied = await applyAdaptiveRoutingToPrepass({
    workingMetadata,
    req,
    capabilityId: capabilityIdRaw || "text.generate",
    organizationId: trustedOrganizationId,
    executionId,
    requestId: correlationId,
    createId: host.deps.createId,
    nowIso: host.deps.nowIso,
    deps: host.deps.adaptiveRouting,
  });
  workingMetadata = adaptiveApplied.workingMetadata;
  req = adaptiveApplied.req;

  const routingConfig = loadAdaptiveRoutingConfig(process.env);
  const traceService =
    typeof workingMetadata?.service === "string" ? workingMetadata.service : undefined;
  const traceSubtype =
    typeof workingMetadata?.subtype === "string" ? workingMetadata.subtype : undefined;
  const traceOutputKind =
    typeof workingMetadata?.outputKind === "string" ? workingMetadata.outputKind : undefined;
  const traceStructuredOutput = Boolean(req.structuredOutput ?? workingMetadata?.structuredOutput);
  const traceOsPipeline =
    traceOutputKind === "deferred_website" ||
    traceService?.toLowerCase() === "website";

  beginExecutionTrace({
    requestId: correlationId,
    executionId,
    correlationId,
    service: traceService,
    subtype: traceSubtype,
    outputKind: traceOutputKind,
    capabilityId: capabilityIdRaw || "text.generate",
    ...resolveTraceRequestedIdentity(routingPin, workingMetadata),
    adaptiveRoutingEnabled: routingConfig.adaptiveRoutingEnabled,
    usedStructuredOutput: traceStructuredOutput,
    usedOsArtifactPipeline: traceOsPipeline,
  });
  if (conversationExecutionSpec) {
    const { executionSpecObservabilitySummary } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-snapshot"
    );
    const { executionSpecProvenanceObservability } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-provenance"
    );
    recordExecutionTraceStage({
      executionId,
      stage: "requirement_resolution",
      status: "COMPLETED",
      details: executionSpecProvenanceObservability({
        metadata: workingMetadata,
        conversationSpec: conversationExecutionSpec,
      }),
    });
    logOsExecutionEvent("execution.spec.provenance", {
      executionId,
      correlationId,
      ...executionSpecProvenanceObservability({
        metadata: workingMetadata,
        conversationSpec: conversationExecutionSpec,
      }),
    });
  } else if (
    readExecutionSpecSnapshot(
      workingMetadata as Record<string, unknown> | undefined,
    )
  ) {
    const { executionSpecProvenanceObservability } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-provenance"
    );
    const { resolveParentExecutionIdFromMetadata } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-handoff"
    );
    const inheritedFromParent = Boolean(
      resolveParentExecutionIdFromMetadata(workingMetadata),
    );
    logOsExecutionEvent("execution.spec.provenance", {
      executionId,
      correlationId,
      ...executionSpecProvenanceObservability({
        metadata: workingMetadata,
        inheritedFromParent,
      }),
    });
  } else if (
    typeof workingMetadata?.channelId === "string" &&
    workingMetadata.channelId.trim()
  ) {
    recordExecutionTraceStage({
      executionId,
      stage: "requirement_resolution",
      status: "SKIPPED",
      skipReason: "execution_spec_unavailable",
    });
  }
  if (traceService && traceSubtype) {
    const catalogSpec = resolveServiceOutputSpec({
      service: traceService,
      subtype: traceSubtype,
    });
    const { resolveExecutionOutputAuthority } = await import(
      "../../cdf/execution-authority"
    );
    const authority = resolveExecutionOutputAuthority({
      metadata: workingMetadata,
      catalogOutputKind: catalogSpec?.kind,
      declaredOutputKind: traceOutputKind,
    });
    // Classification compares actual vs authoritative contract — not catalog.
    const classificationOk =
      !authority.actualOutputKind ||
      !authority.authoritativeOutputKind ||
      authority.actualOutputKind === authority.authoritativeOutputKind;
    recordClassificationTrace({
      executionId,
      service: traceService,
      subtype: traceSubtype,
      outputKind: authority.authoritativeOutputKind ?? "unknown",
      capabilityId: capabilityIdRaw || "text.generate",
      classificationOk,
      mismatchReason: classificationOk
        ? undefined
        : `actual outputKind=${authority.actualOutputKind} authoritative=${authority.authoritativeOutputKind} source=${authority.authoritySource} catalog=${authority.catalogOutputKind ?? "unknown"}`,
    });
    recordExecutionTraceStage({
      executionId,
      stage: "output_authority",
      status: "COMPLETED",
      details: Object.freeze({
        authoritySource: authority.authoritySource,
        authoritativeOutputKind: authority.authoritativeOutputKind,
        catalogOutputKind: authority.catalogOutputKind,
        actualOutputKind: authority.actualOutputKind,
      }),
    });
  } else {
    recordExecutionTraceStage({
      executionId,
      stage: "classification",
      status: "SKIPPED",
      skipReason: "service_or_subtype_unavailable",
    });
  }
  recordExecutionTraceStage({
    executionId,
    stage: "static_routing",
    status: "COMPLETED",
    details: Object.freeze({
      selectedProviderId: adaptiveApplied.staticProviderId,
      selectedModelId: adaptiveApplied.staticModelId,
    }),
  });
  recordExecutionTraceStage({
    executionId,
    stage: "adaptive_routing",
    status: routingConfig.adaptiveRoutingEnabled ? "COMPLETED" : "SKIPPED",
    skipReason: routingConfig.adaptiveRoutingEnabled ? undefined : "ADAPTIVE_ROUTING_DISABLED",
    details: Object.freeze({
      routingMode: adaptiveApplied.routingMetadata.routingMode,
      adaptiveSelected: adaptiveApplied.routingMetadata.adaptiveSelected === true,
    }),
  });
  updateExecutionTrace({
    executionId,
    patch: Object.freeze({
      selectedProviderId:
        typeof workingMetadata?.preferredProviderId === "string"
          ? workingMetadata.preferredProviderId
          : adaptiveApplied.staticProviderId,
      selectedModelId:
        typeof workingMetadata?.preferredModelId === "string"
          ? workingMetadata.preferredModelId
          : adaptiveApplied.staticModelId,
      routingMode: adaptiveApplied.routingMetadata.routingMode,
      adaptiveDecision: adaptiveApplied.routingMetadata.adaptiveSelected
        ? "USE_ADAPTIVE"
        : "USE_EXISTING",
    }),
  });

  return success({
    kind: "continue",
    state: {
      req,
      principal,
      capabilityIdRaw,
      prompt,
      trustedOrganizationId,
      workingMetadata,
      executionSpecSnapshot: readExecutionSpecSnapshot(workingMetadata),
      executionSpec: conversationExecutionSpec,
      providerPrompt: providerPromptAfterSpec,
      requestFingerprint,
      executionId,
      correlationId,
      now,
    },
  });
}
