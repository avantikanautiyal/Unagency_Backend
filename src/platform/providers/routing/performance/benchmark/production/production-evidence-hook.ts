/**
 * Step 10 — Production API hook (non-blocking evidence + shadow).
 */

import { scheduleProductionEvidenceAndShadow } from "./production-evidence-service";
import type { ProductionExecutionEvidenceContext, ProductionEvidenceServiceDeps } from "./production-evidence-service";
import type { ProductionArtifactEvaluationDeps } from "./production-validation-resolver";
import { resolveAdaptiveExecutionOutcome } from "../adaptive/adaptive-execution-outcome";
import {
  readExecutionSpecFromMetadata,
  readExecutionSpecSnapshot,
  resolveBriefObjectiveFromMetadata,
} from "../../../../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import type { DeliverableFormat } from "../../../../../collaboration/conversational-task-intelligence/execution-specification";

function resolveProductionOutputKind(capabilityId: string, outputKind?: string): string {
  const kind = outputKind?.trim();
  if (kind) return kind;
  if (capabilityId.includes("image")) return "image";
  if (capabilityId.includes("video")) return "video";
  return "copy";
}

export type ProductionEvidenceHookInput = {
  readonly organizationId: string;
  readonly executionId: string;
  readonly requestId?: string;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly preview: string;
  readonly briefObjective?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly providerSuccess: boolean;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number | null;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly knowledgeId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly executionSpecSnapshot?: import("../../../../../collaboration/conversational-task-intelligence/execution-spec-snapshot").ExecutionSpecSnapshot;
  readonly presentDeliverableFormats?: readonly DeliverableFormat[];
  readonly generatedQuantity?: number;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly generatedPageCount?: number;
  readonly previewContainsCta?: boolean;
  readonly artifactEvaluationDeps?: ProductionArtifactEvaluationDeps;
  readonly routingMode?: "static" | "adaptive";
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
  readonly adaptiveDecisionId?: string;
  readonly adaptiveSelected?: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly adaptiveExecutionFailed?: boolean;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
};

function readMetaString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Schedule production evidence ingestion + shadow decision after execution finalize.
 * Does not block user response; never modifies routing.
 */
export function hookProductionEvidenceAfterFinalize(input: ProductionEvidenceHookInput): void {
  const service = input.service?.trim();
  const subtype = input.subtype?.trim();
  if (!service || !subtype) return;

  const outputKind = resolveProductionOutputKind(input.capabilityId, input.outputKind);

  const enrichedMetadata = resolveAdaptiveExecutionOutcome({
    executionId: input.executionId,
    correlationId: input.requestId,
    metadata: input.metadata ?? {},
    finalProviderId: input.providerId,
    finalModelId: input.modelId,
    providerSucceeded: input.providerSuccess,
  });

  const executionSpecSnapshot =
    input.executionSpecSnapshot ?? readExecutionSpecSnapshot(enrichedMetadata);
  const executionSpec = executionSpecSnapshot?.spec ?? readExecutionSpecFromMetadata(enrichedMetadata);
  const briefObjective =
    resolveBriefObjectiveFromMetadata(enrichedMetadata, input.briefObjective) ??
    input.briefObjective;

  const context: ProductionExecutionEvidenceContext = Object.freeze({
    organizationId: input.organizationId,
    productionExecutionId: input.executionId,
    requestId: input.requestId,
    providerId: input.providerId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    capabilityId: input.capabilityId,
    service,
    subtype,
    outputKind,
    industry: input.industry ?? readMetaString(input.metadata, "industry"),
    platform: input.platform ?? readMetaString(input.metadata, "platform"),
    format: input.format ?? readMetaString(input.metadata, "format"),
    preview: input.preview,
    briefObjective,
    strategyId:
      input.strategyId ??
      readMetaString(input.metadata, "strategyId") ??
      "strategy.baseline",
    strategyVersion:
      input.strategyVersion ?? readMetaString(input.metadata, "strategyVersion") ?? "1.0.0",
    knowledgeId: input.knowledgeId ?? readMetaString(input.metadata, "knowledgeId"),
    structuredData: input.structuredData,
    mediaArtifactIds: input.mediaArtifactIds,
    executionSpec,
    executionSpecSnapshot,
    presentDeliverableFormats: input.presentDeliverableFormats,
    generatedQuantity: input.generatedQuantity,
    generatedWidth: input.generatedWidth,
    generatedHeight: input.generatedHeight,
    generatedPageCount: input.generatedPageCount,
    previewContainsCta: input.previewContainsCta,
    metadata: enrichedMetadata,
    latencyMs: Math.max(0, input.latencyMs),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    estimatedCost: input.estimatedCost,
    providerSuccess: input.providerSuccess,
    routingMode:
      input.routingMode ??
      (readMetaString(enrichedMetadata, "routingMode") as "static" | "adaptive" | undefined),
    routingPolicyId: input.routingPolicyId ?? readMetaString(enrichedMetadata, "routingPolicyId"),
    routingPolicyVersion:
      input.routingPolicyVersion ?? readMetaString(enrichedMetadata, "routingPolicyVersion"),
    adaptiveDecisionId:
      input.adaptiveDecisionId ?? readMetaString(enrichedMetadata, "adaptiveDecisionId"),
    adaptiveSelected:
      input.adaptiveSelected ??
      (enrichedMetadata.adaptiveSelected === true ? true : undefined),
    adaptiveExecutionSucceeded:
      input.adaptiveExecutionSucceeded ??
      (enrichedMetadata.adaptiveExecutionSucceeded === true ? true : undefined),
    adaptiveExecutionFailed:
      input.adaptiveExecutionFailed ??
      (enrichedMetadata.adaptiveExecutionFailed === true ? true : undefined),
    fallbackUsed:
      input.fallbackUsed ??
      (enrichedMetadata.fallbackUsed === true ? true : undefined),
    fallbackReason:
      input.fallbackReason ??
      readMetaString(enrichedMetadata, "fallbackReason"),
    createId: input.createId,
    nowIso: input.nowIso,
  });

  scheduleProductionEvidenceAndShadow(context, {
    ...(input.artifactEvaluationDeps
      ? { artifactEvaluationDeps: input.artifactEvaluationDeps }
      : {}),
  } satisfies ProductionEvidenceServiceDeps);
}
