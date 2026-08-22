/**
 * Create-execution prepass — validation, tenant, product assets/selection,
 * service context, output map, soft routing, idempotency + tenant quota,
 * allocate executionId/correlationId/now.
 */

import mongoose from "mongoose";
import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError, AuthorizationError } from "../../intelligence/shared/errors";
import { classifyServiceContext } from "../../os/brief/engine/service-context-classifier";
import type { AuthPrincipal, CreateExecutionRequest } from "../contracts";
import { isFirebaseAuthenticatedPrincipal } from "../auth/firebase/firebase-authentication-adapter";
import {
  parseProductMode,
  productModeBlocksAiExecution,
  PRODUCT_MODE_HUMAN_AI_BLOCKED,
} from "../../os";
import {
  isAudioTranscribeCapability,
  isAudioSynthesizeCapability,
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../intelligence/providers/common/resolve-execution-modality";
import { enrichExecutionMetadataWithProductAssets } from "../../../services/product-asset-intelligence-bridge";
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

  // Trusted tenant for downstream intelligence (never use untrusted client override).
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

  // M10.15 — ProductAsset ids → Intelligence audio/assets payload
  let workingMetadata: Record<string, unknown> | undefined = req.metadata
    ? { ...req.metadata }
    : undefined;
  const rawAssetIds = workingMetadata?.assetIds;
  const hasAssetIds =
    (Array.isArray(rawAssetIds) && rawAssetIds.length > 0) ||
    (typeof rawAssetIds === "string" && rawAssetIds.trim().length > 0);
  if (hasAssetIds && principal.userId) {
    try {
      workingMetadata = await enrichExecutionMetadataWithProductAssets({
        userId: principal.userId,
        organizationId: trustedOrganizationId,
        metadata: workingMetadata,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to resolve product assets for intelligence";
      return failure(new ValidationError(message));
    }
  }

  // M10.17 / Phase 3 — product selection metadata only before Brief.
  // Canonical KnowledgeContext is applied AFTER Brand Intelligence.
  const mongoConnected = mongoose.connection.readyState === 1;
  if (workingMetadata?.skipBrandKnowledge === true) {
    const { logAiOsLine } = await import(
      "../../intelligence/integration/observability/ai-os-layer-log"
    );
    logAiOsLine(
      "layer skip · knowledge intelligence | reason=skipBrandKnowledge metadata"
    );
  } else if (!mongoConnected) {
    const { logAiOsLine } = await import(
      "../../intelligence/integration/observability/ai-os-layer-log"
    );
    logAiOsLine(
      "layer skip · knowledge prepass | reason=mongo_not_connected"
    );
  } else if (workingMetadata?.skipBrandKnowledge !== true && mongoConnected) {
    try {
      const productService =
        typeof workingMetadata?.service === "string" && workingMetadata.service
          ? workingMetadata.service
          : undefined;
      const productCategory =
        typeof workingMetadata?.category === "string" && workingMetadata.category
          ? workingMetadata.category
          : undefined;
      const productPath =
        typeof workingMetadata?.productPath === "string" &&
        workingMetadata.productPath
          ? workingMetadata.productPath
          : undefined;
      const deliverableLabel =
        typeof workingMetadata?.deliverableLabel === "string" &&
        workingMetadata.deliverableLabel
          ? workingMetadata.deliverableLabel
          : undefined;
      const aspectRatioMeta =
        typeof workingMetadata?.aspectRatio === "string" &&
        workingMetadata.aspectRatio
          ? workingMetadata.aspectRatio
          : undefined;

      const brandNameMeta =
        typeof workingMetadata?.brandName === "string"
          ? workingMetadata.brandName.trim()
          : "";

      const productSelectionBlock = [
        brandNameMeta ? `Brand name: ${brandNameMeta}` : "",
        brandNameMeta
          ? `If any wordmark or logo text appears, it MUST spell "${brandNameMeta}" — never the placeholder "BRAND".`
          : "",
        deliverableLabel ? `Deliverable: ${deliverableLabel}` : "",
        productPath ? `Path: ${productPath}` : "",
        productCategory ? `Category: ${productCategory}` : "",
        aspectRatioMeta ? `Aspect ratio: ${aspectRatioMeta}` : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n");

      if (productSelectionBlock) {
        const enrichedPrompt = [
          `[Product selection — required deliverable]\n${productSelectionBlock}\nHonor this platform/format exactly.`,
          `[User prompt]\n${prompt}`,
        ].join("\n");
        workingMetadata = {
          ...workingMetadata,
          enrichedPrompt,
        };
      }
    } catch {
      // Non-fatal: product selection enrichment is best-effort.
    }
  }

  // Mixed-service prompts — clarify mismatch/split; queue compound follow-ups in metadata.
  if (workingMetadata?.skipServiceContextCheck !== true) {
    const isRefineContext =
      workingMetadata?.productAction === "refine_brief" ||
      Boolean(workingMetadata?.refineFromExecutionId);
    const isEnhanceContext = workingMetadata?.productAction === "enhance_prompt";
    const forceStay = workingMetadata?.forceStayInService === true;
    const resolvedContext = workingMetadata?.serviceContextResolved === true;

    if (!isRefineContext && !isEnhanceContext && !resolvedContext) {
      const serviceContext = classifyServiceContext({
        prompt,
        service:
          typeof workingMetadata?.service === "string"
            ? workingMetadata.service
            : undefined,
        subtype:
          typeof workingMetadata?.subtype === "string"
            ? workingMetadata.subtype
            : undefined,
        platform:
          typeof workingMetadata?.platform === "string"
            ? workingMetadata.platform
            : undefined,
        format:
          typeof workingMetadata?.format === "string"
            ? workingMetadata.format
            : undefined,
        productPath:
          typeof workingMetadata?.productPath === "string"
            ? workingMetadata.productPath
            : undefined,
        deliverableLabel:
          typeof workingMetadata?.deliverableLabel === "string"
            ? workingMetadata.deliverableLabel
            : undefined,
      });

      workingMetadata = {
        ...(workingMetadata ?? {}),
        serviceContextKind: serviceContext.kind,
        serviceContextConfidence: serviceContext.confidence,
        ...(serviceContext.detected?.label
          ? { serviceContextDetectedLabel: serviceContext.detected.label }
          : {}),
      };

      if (
        serviceContext.kind === "mismatch" &&
        !forceStay &&
        serviceContext.confidence !== "low"
      ) {
        return failure(
          new ValidationError(
            serviceContext.message ??
              "Service context clarification required",
            {
              reason: "SERVICE_CONTEXT_CLARIFICATION",
              serviceContext,
            }
          )
        );
      }

      if (serviceContext.kind === "split" && !forceStay) {
        return failure(
          new ValidationError(
            serviceContext.message ?? "Multiple deliverables detected",
            {
              reason: "SERVICE_CONTEXT_CLARIFICATION",
              serviceContext,
            }
          )
        );
      }

      if (serviceContext.kind === "compound" && serviceContext.workflow) {
        workingMetadata = {
          ...workingMetadata,
          serviceContextWorkflow: serviceContext.workflow,
          serviceContextAcknowledgment: serviceContext.workflow.acknowledgment,
          // Opt-in Task Intelligence plan — multi-deliverable earns a real DAG.
          enableExecutionPlan: true,
          taskGraphRecommended: true,
          multiDeliverable: true,
          serviceContextKind: "compound",
        };
      }
    }
  }

  // Spreadsheet output map + vague-prompt gate for dynamic / Other services.
  try {
    const {
      resolveServiceOutputSpec,
      isPromptTooVagueForOutput,
    } = await import("../../os/brief/engine/service-output-map");
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
      ...(workingMetadata ?? {}),
      outputKind: outputSpec.kind,
      outputModalities: [...outputSpec.modalities],
      needsMockup: outputSpec.needsMockup,
      needs3dMockup: outputSpec.needs3dMockup,
      askIfVague: outputSpec.askIfVague,
      exampleDeliverable: outputSpec.exampleDeliverable,
    };

    if (
      workingMetadata?.skipVaguePromptCheck !== true &&
      isPromptTooVagueForOutput({
        prompt,
        service:
          typeof workingMetadata?.service === "string"
            ? workingMetadata.service
            : undefined,
        subtype:
          typeof workingMetadata?.subtype === "string"
            ? workingMetadata.subtype
            : undefined,
      })
    ) {
      return failure(
        new ValidationError(
          `Your request is too vague for ${outputSpec.exampleDeliverable}. Please describe the goal, audience, brand, and what you want delivered.`,
          {
            reason: "PROMPT_TOO_VAGUE",
            outputKind: outputSpec.kind,
            questions: [
              "What is the primary goal of this deliverable?",
              "Who is the audience?",
              "What format do you need (e.g. pitch deck, PDF, image, video)?",
              "Any brand constraints (name, colors, tone)?",
            ],
          }
        )
      );
    }
  } catch {
    // Non-fatal: output map enrichment is best-effort.
  }

  // Client matrix image routing — prefer Recraft/GPT Image/Gemini image/FLUX by use-case.
  if (
    isImageGenerationCapability(capabilityIdRaw) &&
    host.deps.imageRouter
  ) {
    const preferredProviderId =
      req.providerId?.trim() ||
      (typeof workingMetadata?.preferredProviderId === "string"
        ? workingMetadata.preferredProviderId
        : typeof workingMetadata?.providerId === "string"
          ? workingMetadata.providerId
          : undefined);
    const preferredModelId =
      req.modelId?.trim() ||
      (typeof workingMetadata?.preferredModelId === "string"
        ? workingMetadata.preferredModelId
        : typeof workingMetadata?.modelId === "string"
          ? workingMetadata.modelId
          : undefined);
    const routed = host.deps.imageRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "image.generate",
      preferredProviderId,
      preferredModelId,
    });
    if (routed.ok) {
      workingMetadata = {
        ...workingMetadata,
        preferredProviderId: routed.value.providerId,
        preferredModelId: routed.value.modelId,
        imageUseCase: routed.value.useCase,
        imageProviderLabel: routed.value.label,
      };
    }
  } else if (
    isAudioSynthesizeCapability(capabilityIdRaw) &&
    host.deps.audioRouter
  ) {
    const routed = host.deps.audioRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "audio.synthesize",
      preferredProviderId: req.providerId?.trim(),
      preferredModelId: req.modelId?.trim(),
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
    // Soft matrix preference for text / reasoning / research / coding.
    const routed = host.deps.textRouter.resolve({
      prompt,
      capabilityId: capabilityIdRaw || "text.generate",
      preferredProviderId: req.providerId?.trim(),
      preferredModelId: req.modelId?.trim(),
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

  req = {
    ...req,
    prompt,
    metadata: workingMetadata,
    ...(typeof workingMetadata?.preferredProviderId === "string"
      ? { providerId: workingMetadata.preferredProviderId }
      : {}),
    ...(typeof workingMetadata?.preferredModelId === "string"
      ? { modelId: workingMetadata.preferredModelId }
      : {}),
  };

  // M10.17 — provider-facing prompt carries brand/knowledge enrichment;
  // promptPreview (client-facing) always stays the user's raw prompt.
  let providerPrompt =
    typeof workingMetadata?.enrichedPrompt === "string" &&
    workingMetadata.enrichedPrompt
      ? workingMetadata.enrichedPrompt
      : req.prompt;

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

  return success({
    kind: "continue",
    state: {
      req,
      principal,
      capabilityIdRaw,
      prompt,
      trustedOrganizationId,
      workingMetadata,
      providerPrompt,
      requestFingerprint,
      executionId,
      correlationId,
      now,
    },
  });
}
