/**
 * Create-execution prepass — validation, tenant, output map metadata,
 * matrix model routing, idempotency. Direct provider path only.
 */

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
import { stampPresentationCreateMetadata } from "../../direct/presentation-direct-metadata";
import { stampDocumentCreateMetadata } from "../../direct/document-direct-metadata";
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
  EXECUTION_MAX_PROMPT_CHARS,
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
import { readExecutionSpecSnapshot } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import {
  applyVisualModificationPrepass,
  routeImageWithReferenceSupport,
} from "./apply-visual-modification-prepass";

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
export function resolveClientRoutingPin(
  req: CreateExecutionRequest,
  metadata: Readonly<Record<string, unknown>> | undefined
): { providerId?: string; modelId?: string } {
  const providerId =
    req.providerId?.trim() ||
    (typeof metadata?.preferredProviderId === "string"
      ? metadata.preferredProviderId.trim()
      : undefined) ||
    (typeof metadata?.providerId === "string"
      ? metadata.providerId.trim()
      : undefined);
  const modelId =
    req.modelId?.trim() ||
    (typeof metadata?.preferredModelId === "string"
      ? metadata.preferredModelId.trim()
      : undefined) ||
    (typeof metadata?.modelId === "string" ? metadata.modelId.trim() : undefined);
  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
  };
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
  if (prompt.length > EXECUTION_MAX_PROMPT_CHARS) {
    return failure(new ValidationError("prompt exceeds maximum length"));
  }
  if (req.metadata) {
    const metaSize = JSON.stringify(req.metadata).length;
    if (metaSize > EXECUTION_MAX_METADATA_BYTES) {
      return failure(new ValidationError("metadata exceeds maximum size"));
    }
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

  // Service conversation context — derive follow-up intent + continuity from persisted chat.
  let conversationExecutionSpec: import("../../collaboration/conversational-task-intelligence").CanonicalExecutionSpecification | undefined;
  const isRouteVisualFanout =
    typeof workingMetadata?.productAction === "string" &&
    (workingMetadata.productAction.trim().toLowerCase() === "route_visual" ||
      workingMetadata.productAction.trim().toLowerCase() === "route_visual_refine");
  try {
    const channelId =
      typeof workingMetadata?.channelId === "string"
        ? workingMetadata.channelId.trim()
        : "";
    const userId = principal.userId?.trim();
    if (channelId && userId) {
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
          }),
        );
      }
      if (ctx.executionSpec?.resolutionState === "UNSUPPORTED_DELIVERABLE") {
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
        prompt = ctx.effectiveInstruction.trim();
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
  if (brandIdForUx && prompt.trim() && !logoRoleFromMetadata(workingMetadata)) {
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
  let prepassBrandExtract: EnrichedBrandPreferences | undefined;
  if (brandIdForUx && prompt.trim()) {
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
        workingMetadata = applyDirectPassthroughMetadata({
          ...workingMetadata,
          ...colorExtras,
          ...(prepassBrandExtract.extractionSource
            ? { brandExtractSource: prepassBrandExtract.extractionSource }
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
          const missingSlots = [...continuity.packet.missingRequiredSlots];
          if (
            missingSlots.length === 1 &&
            missingSlots[0] === "logo"
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
          }
          const missing = missingSlots.join(", ");
          return failure(
            new ValidationError(
              `Approved brand assets required but missing: ${missing}. Upload or approve them first — Unagency will not invent brand identity.`,
              { reason: "CONTINUITY_SLOT_MISSING", missingRequiredSlots: missing }
            )
          );
        }
        // Refine reuse: prefer already-bound packet/assets if binder did not apply.
        if (
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
      workingMetadata = applyDirectPassthroughMetadata({
        ...workingMetadata,
        ...jobObjectMetadataExtras(job),
      });
    } catch {
      // Job object must never break thin create.
    }
  }

  const brandIdForLogo =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  if (brandIdForLogo && prompt.trim()) {
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
    // P4.6 — explicit user deliverables override service default output kind.
    if (conversationExecutionSpec?.deliverables.length) {
      const { executionSpecOutputKindOverride } = await import(
        "../../collaboration/conversational-task-intelligence"
      );
      const kindOverride = executionSpecOutputKindOverride(conversationExecutionSpec);
      if (kindOverride) {
        workingMetadata = {
          ...workingMetadata,
          outputKind: kindOverride,
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
    const clientStructuredName =
      req.structuredOutput &&
      typeof req.structuredOutput === "object" &&
      typeof req.structuredOutput.name === "string"
        ? req.structuredOutput.name
        : "";
    const isMediaCapability =
      isImageGenerationCapability(capabilityIdRaw) ||
      isVideoGenerationCapability(capabilityIdRaw);
    const isVisualDeliverableKind =
      outputSpec.kind === "image" ||
      outputSpec.kind === "video" ||
      outputSpec.kind === "edited_image" ||
      outputSpec.kind === "animation" ||
      outputSpec.kind === "image_mockup" ||
      outputSpec.kind === "image_3d_mockup";
    const needsPresentationExpand =
      !isMediaCapability &&
      !isVisualDeliverableKind &&
      (outputSpec.kind === "presentation" ||
        clientStructuredName === "PresentationRouteConcepts");
    if (needsPresentationExpand) {
      const subtype =
        typeof workingMetadata?.subtype === "string"
          ? workingMetadata.subtype.trim().toLowerCase()
          : "";
      // Never honor stale client "lazy" for pitch decks — concepts-only is not
      // a completed presentation deliverable (PDF/PPTX require full slide decks).
        workingMetadata = {
          ...workingMetadata,
          presentationExpandMode: subtype === "gifs" ? "lazy" : "full",
          deliverableRequired: subtype !== "gifs",
          ...(outputSpec.kind !== "presentation"
            ? { outputKind: "presentation" }
            : {}),
        };
      // Server-authoritative schema so Direct always enters the presentation
      // gate + full expand (client schema omission must not skip tools).
      if (subtype !== "gifs") {
        const structuredOutput = {
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

    // Web Tech — always 3 WebsiteRoutes (content-fill); server expands scaffolds.
    if (outputSpec.kind === "deferred_website") {
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
        outputKind: "deferred_website",
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
  if (
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
    const routed = await routeImageWithReferenceSupport({
      metadata: workingMetadata ?? {},
      prompt,
      capabilityId: capabilityIdRaw || "image.generate",
      imageRouter: host.deps.imageRouter,
      preferredProviderId: clientRoutingPin.providerId,
      preferredModelId: clientRoutingPin.modelId,
      ...(Number.isFinite(routeVisualSlot) ? { routeVisualSlot } : {}),
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
    const matrixRoute = host.deps.imageRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "image.generate",
      preferredProviderId: routed.value.providerId,
      preferredModelId: routed.value.modelId,
      ...(Number.isFinite(routeVisualSlot) ? { routeVisualSlot } : {}),
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
    if (matrixRoute.ok) {
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        imageUseCase: matrixRoute.value.useCase,
        imageProviderLabel: matrixRoute.value.label,
        ...(matrixRoute.value.failoverChain.length
          ? { imageFailoverChain: matrixRoute.value.failoverChain }
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
      preferredProviderId: clientRoutingPin.providerId,
      preferredModelId: clientRoutingPin.modelId,
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
        videoUseCase: routed.value.capabilityId,
        videoProviderLabel: routed.value.providerId,
      };
    }
  } else if (
    isAudioSynthesizeCapability(capabilityIdRaw) &&
    host.deps.audioRouter
  ) {
    const routed = host.deps.audioRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "audio.synthesize",
      preferredProviderId: clientRoutingPin.providerId,
      preferredModelId: clientRoutingPin.modelId,
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
      preferredProviderId: clientRoutingPin.providerId,
      preferredModelId: clientRoutingPin.modelId,
      metadata: workingMetadata,
    });
    if (routed.ok) {
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        textUseCase: routed.value.useCase,
        textProviderLabel: routed.value.label,
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

  workingMetadata = stampDocumentCreateMetadata(
    stampPresentationCreateMetadata(workingMetadata)
  );

  const mediaSanitized = sanitizeMediaGenerationCreateMetadata({
    metadata: workingMetadata,
    capabilityId: capabilityIdRaw,
    structuredOutput: req.structuredOutput,
  });
  workingMetadata = mediaSanitized.metadata;

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

  const brandIdForLearn =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId.trim()
      : "";
  if (brandIdForLearn && prompt.trim()) {
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
    requestedProviderId: clientRoutingPin.providerId,
    requestedModelId: clientRoutingPin.modelId,
    adaptiveRoutingEnabled: routingConfig.adaptiveRoutingEnabled,
    usedStructuredOutput: traceStructuredOutput,
    usedOsArtifactPipeline: traceOsPipeline,
  });
  if (conversationExecutionSpec) {
    const { executionSpecObservabilitySummary } = await import(
      "../../collaboration/conversational-task-intelligence/execution-spec-snapshot"
    );
    recordExecutionTraceStage({
      executionId,
      stage: "requirement_resolution",
      status: "COMPLETED",
      details: executionSpecObservabilitySummary(conversationExecutionSpec),
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
    const classificationOk =
      !traceOutputKind || !catalogSpec || traceOutputKind === catalogSpec.kind;
    recordClassificationTrace({
      executionId,
      service: traceService,
      subtype: traceSubtype,
      outputKind: traceOutputKind ?? catalogSpec?.kind ?? "unknown",
      capabilityId: capabilityIdRaw || "text.generate",
      classificationOk,
      mismatchReason: classificationOk
        ? undefined
        : `declared outputKind=${traceOutputKind} catalog kind=${catalogSpec?.kind ?? "unknown"}`,
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
      providerPrompt,
      requestFingerprint,
      executionId,
      correlationId,
      now,
    },
  });
}
