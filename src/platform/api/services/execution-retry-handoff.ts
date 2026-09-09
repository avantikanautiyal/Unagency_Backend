/**
 * P4.9.5 — Canonical continuation metadata for retry/duplicate create requests.
 * Reuses parent execution spec + website task context without a second planner.
 */

import type {
  CreateExecutionRequest,
  ExecutionResource,
} from "../contracts";
import { readExecutionSpecSnapshot } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";

const RETRYABLE_METADATA_KEYS = [
  "service",
  "subtype",
  "platform",
  "format",
  "category",
  "outputKind",
  "outputModalities",
  "structuredOutput",
  "websiteUserBrief",
  "userBrief",
  "preferredWebStack",
  "webStack",
  "preferredStack",
  "channelId",
  "conversationId",
  "conversationalEffectiveInstruction",
  "conversationalAction",
  "executionSpecHandoff",
  "executionSpecPlaneVersion",
  "executionSpecResolutionState",
  "executionSpecOutputMode",
  "executionSpecDeliverables",
  "executionSpecQuantity",
  "executionSpecFinalMode",
  "brandName",
  "requiredBrandName",
  "productAction",
  "deliverableRequired",
  "exampleDeliverable",
  "toolNames",
  "preferredProviderId",
  "preferredModelId",
  "refineFromExecutionId",
  "refineRouteId",
  "parentExecutionId",
  "assetIds",
  "logoAssetId",
  "brandLogoAssetId",
  "vaultLogoChoice",
  "brandLogoProvenance",
  "logoAvailable",
  "authoritativeLogo",
  "logoChoiceRequired",
  "logoChoiceCandidates",
  "producedDeliverableFormats",
] as const;

export type ExecutionContinuationReason = "retry" | "duplicate";

export function pickRetryableCreateMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const key of RETRYABLE_METADATA_KEYS) {
    const value = metadata[key];
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  const snapshot = readExecutionSpecSnapshot(metadata);
  if (snapshot) {
    out.executionSpecSnapshot = snapshot;
  }
  return out;
}

export function mergeParentCreateMetadata(input: {
  readonly parentExecution: ExecutionResource;
  readonly parentCreateMetadata?: Readonly<Record<string, unknown>>;
  readonly parentJobMetadata?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const fromJob = pickRetryableCreateMetadata(input.parentJobMetadata);
  const fromSnapshot = pickRetryableCreateMetadata(input.parentCreateMetadata);
  const merged = { ...fromJob, ...fromSnapshot };

  if (input.parentExecution.brandId?.trim()) {
    merged.brandId = input.parentExecution.brandId.trim();
  }
  if (input.parentExecution.channelId?.trim()) {
    merged.channelId = input.parentExecution.channelId.trim();
  }
  if (input.parentExecution.conversationId?.trim()) {
    merged.conversationId = input.parentExecution.conversationId.trim();
  }
  return merged;
}

export function buildContinuationCreateRequest(input: {
  readonly parentExecution: ExecutionResource;
  readonly parentCreateMetadata?: Readonly<Record<string, unknown>>;
  readonly parentJobMetadata?: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly reason: ExecutionContinuationReason;
}): CreateExecutionRequest {
  const parentId = input.parentExecution.executionId;
  const inherited = mergeParentCreateMetadata({
    parentExecution: input.parentExecution,
    parentCreateMetadata: input.parentCreateMetadata,
    parentJobMetadata: input.parentJobMetadata,
  });

  const metadata: Record<string, unknown> = {
    ...inherited,
    parentExecutionId: parentId,
    ...(input.reason === "retry"
      ? { retriedFrom: parentId, continuationKind: "retry" }
      : { duplicatedFrom: parentId, continuationKind: "duplicate" }),
  };

  const structuredOutput =
    inherited.structuredOutput &&
    typeof inherited.structuredOutput === "object"
      ? (inherited.structuredOutput as CreateExecutionRequest["structuredOutput"])
      : undefined;

  const toolNames = Array.isArray(inherited.toolNames)
    ? (inherited.toolNames as readonly string[])
    : undefined;

  return {
    prompt:
      (typeof inherited.websiteUserBrief === "string" &&
        inherited.websiteUserBrief.trim()) ||
      (typeof inherited.conversationalEffectiveInstruction === "string" &&
        inherited.conversationalEffectiveInstruction.trim()) ||
      input.parentExecution.promptPreview,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? input.parentExecution.workspaceId,
    capabilityId: input.parentExecution.capabilityId ?? "text.generate",
    providerId: input.parentExecution.providerId,
    modelId: input.parentExecution.modelId,
    metadata,
    ...(structuredOutput ? { structuredOutput } : {}),
    ...(toolNames?.length ? { toolNames } : {}),
  };
}
