/**
 * P4.9 — Prepass hook: resolve artifact reference and stamp image.edit metadata.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { ExecutionArtifactRef } from "../../api/contracts";
import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import type { CanonicalExecutionSpecification } from "../../collaboration/conversational-task-intelligence/execution-specification";
import {
  attachReferenceToExecutionMetadata,
  resolveArtifactReferenceFromStore,
} from "../../collaboration/conversational-task-intelligence/artifact-reference-bridge";
import {
  assertReferenceCapableProviderOrUnsupported,
  isGroundedVisualAction,
  planArtifactGroundedModification,
  pickReferenceCapableCandidate,
} from "../../collaboration/conversational-task-intelligence/visual-modification-plan";
import {
  listReferenceCapableImageProviderIds,
  listReferenceImageProviderIds,
  providerSupportsReferenceImage,
  providerSupportsReferenceImageEdit,
} from "../../providers/image/configs/image-provider-capabilities";
import type { ImageExecutionRouter } from "../../providers/image/routing/image-execution-router";

function inlineArtifactFromStore(
  artifactStore: Map<string, ExecutionArtifactRef[]> | undefined,
  artifactId: string,
): { artifact?: ExecutionArtifactRef; executionId?: string } {
  if (!artifactStore) return {};
  for (const [executionId, artifacts] of artifactStore.entries()) {
    const found = artifacts.find((a) => a.artifactId === artifactId);
    if (found) return { artifact: found, executionId };
  }
  return {};
}

export async function applyVisualModificationPrepass(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly executionSpec?: CanonicalExecutionSpecification;
  readonly artifactsRepo?: IArtifactRepository;
  readonly blobStorage?: IBlobStorage;
  readonly artifactStore?: Map<string, ExecutionArtifactRef[]>;
}): Promise<
  Result<{
    readonly metadata: Record<string, unknown>;
    readonly capabilityId?: string;
  }>
> {
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  const action =
    typeof meta.conversationalAction === "string"
      ? meta.conversationalAction
      : input.executionSpec?.task.action?.value;

  const referencedArtifactId =
    typeof meta.conversationalReferencedArtifactId === "string"
      ? meta.conversationalReferencedArtifactId.trim()
      : typeof meta.referenceArtifactId === "string"
        ? meta.referenceArtifactId.trim()
        : input.executionSpec?.operation?.targetArtifactId ??
          input.executionSpec?.operation?.referenceInput?.artifactId;

  const plan =
    input.executionSpec?.operation ??
    planArtifactGroundedModification({
      action,
      referencedArtifactId,
      message:
        typeof meta.conversationalEffectiveInstruction === "string"
          ? meta.conversationalEffectiveInstruction
          : undefined,
    });

  if (!plan || !isGroundedVisualAction(plan.operationKind)) {
    return success({ metadata: meta });
  }

  const artifactId =
    plan.targetArtifactId ??
    plan.referenceInput?.artifactId ??
    referencedArtifactId;
  if (!artifactId?.trim()) {
    return success({ metadata: meta });
  }
  const inlineLookup = inlineArtifactFromStore(input.artifactStore, artifactId);
  const resolved = await resolveArtifactReferenceFromStore({
    artifactsRepo: input.artifactsRepo,
    blobStorage: input.blobStorage,
    organizationId: input.organizationId,
    artifactId,
    inlineArtifact: inlineLookup.artifact,
    executionId:
      inlineLookup.executionId ??
      (typeof meta.refineFromExecutionId === "string"
        ? meta.refineFromExecutionId
        : undefined),
  });

  if (!resolved) {
    return failure(
      new ValidationError(
        `Cannot modify visual artifact '${artifactId}' — reference image bytes are unavailable.`,
        {
          reason: "ARTIFACT_REFERENCE_UNAVAILABLE",
          targetArtifactId: artifactId,
          operation: plan.operationKind,
        },
      ),
    );
  }

  const stamped = attachReferenceToExecutionMetadata({
    metadata: {
      ...meta,
      conversationalAction: plan.operationKind,
      conversationalReferencedArtifactId: artifactId,
    },
    resolved,
    referenceKind: plan.referenceInput.kind,
  });

  return success({
    metadata: stamped,
    capabilityId: "image.edit",
  });
}

export function resolveReferenceCapableImageRouting(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly routedProviderId: string;
  readonly routedModelId: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}): Result<{
  readonly providerId: string;
  readonly modelId: string;
  readonly fallbackUsed: boolean;
}> {
  const logoBound =
    input.metadata.referenceInputPresent === true ||
    (typeof input.metadata.brandLogoAssetId === "string" &&
      input.metadata.brandLogoAssetId.trim().length > 0) ||
    (typeof input.metadata.logoAssetId === "string" &&
      input.metadata.logoAssetId.trim().length > 0) ||
    (typeof input.metadata.vaultLogoChoice === "string" &&
      input.metadata.vaultLogoChoice.trim().length > 0) ||
    (Array.isArray(input.metadata.assetIds) &&
      input.metadata.assetIds.length > 0);

  if (!logoBound) {
    return success({
      providerId: input.routedProviderId,
      modelId: input.routedModelId,
      fallbackUsed: false,
    });
  }

  const targetArtifactId =
    typeof input.metadata.targetArtifactId === "string"
      ? input.metadata.targetArtifactId
      : typeof input.metadata.referenceArtifactId === "string"
        ? input.metadata.referenceArtifactId
        : "unknown";

  const operationKind =
    typeof input.metadata.visualOperationKind === "string"
      ? input.metadata.visualOperationKind
      : typeof input.metadata.conversationalAction === "string"
        ? input.metadata.conversationalAction
        : undefined;

  const capability =
    typeof input.metadata.capabilityId === "string"
      ? input.metadata.capabilityId.trim().toLowerCase()
      : typeof input.metadata.capabilityHint === "string"
        ? input.metadata.capabilityHint.trim().toLowerCase()
        : "";

  const isArtifactEdit =
    capability === "image.edit" ||
    operationKind === "MODIFY" ||
    operationKind === "REGENERATE";

  const candidates = [
    { providerId: input.routedProviderId, modelId: input.routedModelId },
    ...input.failoverChain,
  ];

  // Logo continuity on generate needs REFERENCE_IMAGE only; artifact edits need edit+ref.
  const capable = isArtifactEdit
    ? pickReferenceCapableCandidate(candidates)
    : candidates.find((c) => providerSupportsReferenceImage(c.providerId));

  if (capable) {
    return success({
      providerId: capable.providerId,
      modelId: capable.modelId,
      fallbackUsed: capable.providerId !== input.routedProviderId,
    });
  }

  // Brand-logo bind: prefer any verified reference-image provider as last resort.
  if (!isArtifactEdit) {
    const logoFallbackId = listReferenceImageProviderIds()[0];
    if (logoFallbackId) {
      return success({
        providerId: logoFallbackId,
        modelId: "default",
        fallbackUsed: true,
      });
    }
  }

  const unsupported = assertReferenceCapableProviderOrUnsupported({
    providerId: input.routedProviderId,
    targetArtifactId,
    hasReferenceInput: true,
    operationKind,
  });

  return failure(
    new ValidationError(
      unsupported?.message ??
        "Reference-image modification is not supported by any configured image provider.",
      {
        reason: "UNSUPPORTED_OPERATION",
        targetArtifactId,
        referenceCapableProviders: listReferenceCapableImageProviderIds(),
        attemptedProviderId: input.routedProviderId,
      },
    ),
  );
}

export function pinReferenceCapableProviderOnMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly providerId: string;
  readonly modelId: string;
  readonly fallbackUsed?: boolean;
}): Record<string, unknown> {
  return {
    ...input.metadata,
    preferredProviderId: input.providerId,
    preferredModelId: input.modelId,
    providerCapability: providerSupportsReferenceImage(input.providerId)
      ? providerSupportsReferenceImageEdit(input.providerId)
        ? "REFERENCE_IMAGE_EDIT"
        : "REFERENCE_IMAGE"
      : "TEXT_TO_IMAGE",
    providerReferenceFallbackUsed: input.fallbackUsed === true,
  };
}

export async function routeImageWithReferenceSupport(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly prompt: string;
  readonly capabilityId: string;
  readonly imageRouter: ImageExecutionRouter;
  readonly routeVisualSlot?: number;
  readonly service?: string;
  readonly platform?: string;
  readonly subtype?: string;
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
}): Promise<
  Result<{
    readonly metadata: Record<string, unknown>;
    readonly providerId: string;
    readonly modelId: string;
  }>
> {
  const routed = input.imageRouter.resolve({
    prompt: input.prompt,
    capabilityId: input.capabilityId,
    preferredProviderId: input.preferredProviderId,
    preferredModelId: input.preferredModelId,
    routeVisualSlot: input.routeVisualSlot,
    service: input.service,
    platform: input.platform,
    subtype: input.subtype,
  });
  if (!routed.ok) return routed;

  const refRoute = resolveReferenceCapableImageRouting({
    metadata: input.metadata,
    routedProviderId: routed.value.providerId,
    routedModelId: routed.value.modelId,
    failoverChain: routed.value.failoverChain,
  });
  if (!refRoute.ok) return refRoute;

  const metadata = pinReferenceCapableProviderOnMetadata({
    metadata: input.metadata,
    providerId: refRoute.value.providerId,
    modelId: refRoute.value.modelId,
    fallbackUsed: refRoute.value.fallbackUsed,
  });

  return success({
    metadata,
    providerId: refRoute.value.providerId,
    modelId: refRoute.value.modelId,
  });
}
