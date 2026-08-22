/**
 * Maps Integration OS report → distributed job summary (safe metadata only).
 */

import type { IntelligenceOsIntegrationReport } from "../../../intelligence/integration/contracts/result";
import type { EnterpriseApiExecutionMode } from "../../../api/runtime/execution-mode";

export function buildIntegrationJobSummary(input: {
  report: IntelligenceOsIntegrationReport;
  executionMode: "simulated" | "live";
  durationMs: number;
}): Readonly<Record<string, unknown>> {
  const { report, executionMode } = input;
  const runtime = report.artifacts.runtime;
  const response = runtime?.response;
  const usage = response?.usage as
    | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    | undefined;
  const routing = report.artifacts.routing;
  const toolApproval = response?.output?.toolApproval as
    | { invocationKeys?: unknown }
    | undefined;
  const awaitingToolApproval = runtime?.error?.code === "TOOL_APPROVAL_REQUIRED";
  const toolOrchestration = response?.output?.toolOrchestration as
    | Readonly<Record<string, unknown>>
    | undefined;

  const providerMode =
    executionMode === "live" && report.stagesCompleted.includes("provider_runtime")
      ? "live"
      : executionMode === "live"
        ? "live"
        : "simulated";

  const resultText = extractSafeResultText(response?.output);
  const structuredData = extractStructuredData(response?.output);

  const evaluationIntegrity = report.artifacts.evaluation?.integrity;
  const experienceIntel = report.artifacts.experienceIntelligence;
  const repositoryUpdates = report.artifacts.repositoryUpdates;
  const experienceIds =
    experienceIntel?.experiences
      ?.map((exp) => exp.experienceId)
      .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];

  return {
    success: awaitingToolApproval ? false : report.success,
    awaitingToolApproval,
    ...(resultText !== undefined ? { resultText } : {}),
    ...(structuredData !== undefined ? { structuredData } : {}),
    toolInvocationKey: Array.isArray(toolApproval?.invocationKeys)
      ? toolApproval.invocationKeys.find((key): key is string => typeof key === "string")
      : undefined,
    toolRounds: toolOrchestration?.modelRounds,
    toolCallsRequested: toolOrchestration?.totalToolCallsRequested,
    toolCallsExecuted: toolOrchestration?.totalToolCallsExecuted,
    toolCallsDenied: toolOrchestration?.totalToolCallsDenied,
    toolFailures: toolOrchestration?.totalToolFailures,
    structuredOutputValidated: toolOrchestration?.structuredOutputValid,
    sideEffectExecuted: toolOrchestration?.sideEffectExecuted,
    blockProviderFailover: toolOrchestration?.blockProviderFailover,
    resultId: report.resultId,
    durationMs: report.durationMs || input.durationMs,
    stagesCompleted: report.stagesCompleted.length,
    postProcessingComplete: report.stagesCompleted.includes("repository_updates"),
    errorMessage: report.success
      ? undefined
      : (() => {
          const stage = report.trace.failedStage;
          const stageMsg = report.trace.stages
            ?.slice()
            .reverse()
            .find(
              (s) =>
                s.stage === stage &&
                s.status === "failed" &&
                typeof s.message === "string" &&
                s.message.trim().length > 0
            )?.message;
          if (stage && stageMsg) return `failed at ${stage}: ${stageMsg}`;
          if (stage) return `failed at ${stage}`;
          return "integration failed";
        })(),
    contextSnapshotId: report.artifacts.contextTrace?.contextSnapshotId,
    brandEnrichmentId: report.artifacts.contextTrace?.brandEnrichmentId,
    brandBrainVersion: report.artifacts.contextTrace?.brandBrainVersion,
    knowledgeSnapshotId: report.artifacts.contextTrace?.knowledgeSnapshotId,
    promptCompilationId: report.artifacts.contextTrace?.promptCompilationId,
    promptVersion: report.artifacts.contextTrace?.promptVersion,
    executionMode,
    providerMode,
    provider: response?.providerId ? String(response.providerId) : undefined,
    model: routing?.plan.primary.modelId
      ? String(routing.plan.primary.modelId)
      : undefined,
    routingDecisionId: routing?.plan.planId,
    routedProviderId: routing?.plan.primary.providerId
      ? String(routing.plan.primary.providerId)
      : undefined,
    routedModelId: routing?.plan.primary.modelId
      ? String(routing.plan.primary.modelId)
      : undefined,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    providerLatencyMs: runtime?.statistics.totalMs,
    providerRequestId: response?.providerRequestId,
    evaluationScore:
      report.artifacts.evaluation?.report?.summary?.overallScore,
    evaluationPlaceholder:
      evaluationIntegrity != null
        ? evaluationIntegrity.feedbackEligible !== true
        : !report.stagesCompleted.includes("evaluation"),
    evaluationFeedbackEligible: evaluationIntegrity?.feedbackEligible === true,
    evaluationStatus: evaluationIntegrity?.evaluationStatus,
    learningSignals: report.artifacts.learning?.signals?.length ?? 0,
    experiencesExtracted: experienceIntel?.experiences?.length ?? 0,
    experiencesSaved: repositoryUpdates?.experiencesSaved ?? 0,
    experienceIds,
    experienceApplied:
      (experienceIntel?.experiences?.length ?? 0) > 0 ||
      (repositoryUpdates?.experiencesSaved ?? 0) > 0,
    consensusWinner: report.artifacts.consensus?.consensus?.winningProviderId,
  };
}

const MAX_RESULT_TEXT = 8_000;

function extractSafeResultText(
  output: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  if (!output) return undefined;
  for (const key of ["content", "text", "message"] as const) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) {
      return value.slice(0, MAX_RESULT_TEXT);
    }
  }
  const outputs = output.outputs;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (typeof item === "string" && item.trim()) {
        return item.slice(0, MAX_RESULT_TEXT);
      }
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        for (const key of ["content", "text", "message"] as const) {
          const value = row[key];
          if (typeof value === "string" && value.trim()) {
            return value.slice(0, MAX_RESULT_TEXT);
          }
        }
      }
    }
  }
  return undefined;
}

function extractStructuredData(
  output: Readonly<Record<string, unknown>> | undefined
): unknown | undefined {
  if (!output) return undefined;
  if (output.structured != null) return output.structured;
  if (output.structuredOutput != null) return output.structuredOutput;
  if (output.data != null && typeof output.data === "object") return output.data;
  return undefined;
}

export function assertRoutingMatchesDispatch(
  report: IntelligenceOsIntegrationReport
): void {
  const routing = report.artifacts.routing;
  const response = report.artifacts.runtime?.response;
  if (!routing || !response) return;
  const routedProvider = String(routing.plan.primary.providerId);
  const actualProvider = String(response.providerId);
  if (routedProvider !== actualProvider && actualProvider !== "openai") {
    throw new Error(
      `routing/dispatch mismatch: routed ${routedProvider} but dispatched ${actualProvider}`
    );
  }
}
