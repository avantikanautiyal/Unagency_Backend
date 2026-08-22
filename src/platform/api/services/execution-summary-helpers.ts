/**
 * Shared helpers for execution create / stream paths.
 */

import type {
  ExecutionDiagnostics,
  ExecutionExperienceSummary,
  ExecutionResource,
} from "../contracts";

export function experienceSummaryFromJobSummary(
  executionId: string,
  jobSummary: Readonly<Record<string, unknown>>
): ExecutionExperienceSummary {
  const experienceIds = Array.isArray(jobSummary.experienceIds)
    ? jobSummary.experienceIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  return {
    executionId,
    experienceIds,
    applied: jobSummary.experienceApplied === true || experienceIds.length > 0,
  };
}


export function diagnosticsFromJobSummary(
  executionId: string,
  errorMessage: string | undefined,
  jobSummary: Readonly<Record<string, unknown>>,
  nowIso: string,
  jobId?: string,
  status?: ExecutionResource["status"]
): ExecutionDiagnostics {
  return {
    executionId,
    rootCause: errorMessage,
    stages: [
      { stage: "api_gateway", status: "ok", durationMs: 1 },
      { stage: "distributed_execution", status: jobId ? "ok" : "skipped" },
      {
        stage: "integration_layer",
        status: status === "failed" ? "error" : "ok",
      },
    ],
    generatedAt: nowIso,
    executionMode:
      typeof jobSummary.executionMode === "string"
        ? jobSummary.executionMode
        : undefined,
    providerMode:
      typeof jobSummary.providerMode === "string"
        ? jobSummary.providerMode
        : undefined,
    provider:
      typeof jobSummary.provider === "string" ? jobSummary.provider : undefined,
    model: typeof jobSummary.model === "string" ? jobSummary.model : undefined,
    routingDecisionId:
      typeof jobSummary.routingDecisionId === "string"
        ? jobSummary.routingDecisionId
        : undefined,
    contextSnapshotId:
      typeof jobSummary.contextSnapshotId === "string"
        ? jobSummary.contextSnapshotId
        : undefined,
    promptCompilationId:
      typeof jobSummary.promptCompilationId === "string"
        ? jobSummary.promptCompilationId
        : undefined,
    brandEnrichmentId:
      typeof jobSummary.brandEnrichmentId === "string"
        ? jobSummary.brandEnrichmentId
        : undefined,
    brandBrainVersion:
      typeof jobSummary.brandBrainVersion === "number"
        ? jobSummary.brandBrainVersion
        : undefined,
    knowledgeSnapshotId:
      typeof jobSummary.knowledgeSnapshotId === "string"
        ? jobSummary.knowledgeSnapshotId
        : undefined,
    inputTokens:
      typeof jobSummary.inputTokens === "number"
        ? jobSummary.inputTokens
        : undefined,
    outputTokens:
      typeof jobSummary.outputTokens === "number"
        ? jobSummary.outputTokens
        : undefined,
    totalTokens:
      typeof jobSummary.totalTokens === "number"
        ? jobSummary.totalTokens
        : undefined,
    providerLatencyMs:
      typeof jobSummary.providerLatencyMs === "number"
        ? jobSummary.providerLatencyMs
        : undefined,
    artifactId:
      typeof jobSummary.artifactId === "string"
        ? jobSummary.artifactId
        : undefined,
    evaluationScore:
      typeof jobSummary.evaluationScore === "number"
        ? jobSummary.evaluationScore
        : undefined,
  };
}

export function mapJobStatus(status: string): ExecutionResource["status"] {
  switch (status) {
    case "queued":
    case "scheduled":
      return "queued";
    case "running":
    case "reserved":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
    case "dead_letter":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "retrying":
      return "retrying";
    default:
      return "running";
  }
}

