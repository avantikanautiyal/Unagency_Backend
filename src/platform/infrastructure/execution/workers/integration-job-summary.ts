/**
 * Maps direct execution report → distributed job summary (safe metadata only).
 */

import {
  recoverWebProjectPlan,
  websiteContextFromMetadata,
  websiteIncompleteErrorMessage,
} from "../../../os/delivery/website-generation";
import { synthesizeDocumentPlanFromText } from "../../../os/delivery/document-generation";
import { recoverPresentationRoutesPayload } from "../../../os/delivery/document-export-service";
import type { DirectExecutionReport } from "../../../direct/contracts";
import type { EnterpriseApiExecutionMode } from "../../../api/runtime/execution-mode";

export function buildIntegrationJobSummary(input: {
  report: DirectExecutionReport;
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
  let structuredData = extractStructuredData(response?.output);
  if (structuredData != null) {
    structuredData = recoverPresentationRoutesPayload(structuredData);
  }
  const metaEarly = report.request?.metadata as
    | Readonly<Record<string, unknown>>
    | undefined;
  const preferredStack = websiteContextFromMetadata(metaEarly, "").stack;
  const recoverOpts = { preferredStack };
  if (!parseWebsiteLike(structuredData, recoverOpts)) {
    const recovered =
      recoverWebProjectPlan(structuredData, recoverOpts) ??
      recoverWebProjectPlan(extractFullResultText(response?.output), recoverOpts);
    if (recovered) structuredData = recovered;
  }

  const failedStage = report.trace.stages
    .slice()
    .reverse()
    .find((s) => s.status === "failed")?.stage;

  const meta = metaEarly;
  const structuredName =
    meta?.structuredOutput && typeof meta.structuredOutput === "object"
      ? String((meta.structuredOutput as { name?: unknown }).name ?? "")
          .trim()
          .toLowerCase()
      : "";
  const isWebsiteJob =
    (typeof meta?.service === "string" &&
      meta.service.trim().toLowerCase() === "website") ||
    (typeof meta?.outputKind === "string" &&
      /^(deferred_)?website$/i.test(meta.outputKind.trim())) ||
    structuredName === "websitepage" ||
    structuredName === "webproject";
  const isDocumentJob =
    structuredName === "documentplan" ||
    (typeof meta?.outputKind === "string" &&
      meta.outputKind.trim().toLowerCase() === "document") ||
    (typeof meta?.service === "string" &&
      meta.service.trim().toLowerCase() === "print" &&
      typeof meta?.subtype === "string" &&
      /brochure|leaflet|guideline/i.test(meta.subtype));
  const websiteMissingDeliverable =
    isWebsiteJob && !parseWebsiteLike(structuredData, recoverOpts);
  let documentPlanRecovered = false;
  if (isDocumentJob && !looksLikeDocumentPlan(structuredData)) {
    const recovered =
      (typeof resultText === "string"
        ? synthesizeDocumentPlanFromText(resultText)
        : null) ??
      (typeof extractFullResultText(response?.output) === "string"
        ? synthesizeDocumentPlanFromText(
            extractFullResultText(response?.output) as string
          )
        : null);
    if (recovered) {
      structuredData = recovered;
      documentPlanRecovered = true;
    }
  }
  const documentMissingDeliverable =
    isDocumentJob && !looksLikeDocumentPlan(structuredData);
  const effectiveSuccess =
    awaitingToolApproval ||
    websiteMissingDeliverable ||
    documentMissingDeliverable
      ? false
      : report.success;

  const runtimeError =
    typeof runtime?.error?.message === "string" && runtime.error.message.trim()
      ? runtime.error.message.trim()
      : undefined;

  const routedProviderId = routing?.plan.primary.providerId
    ? String(routing.plan.primary.providerId)
    : undefined;
  const routedModelId = routing?.plan.primary.modelId
    ? String(routing.plan.primary.modelId)
    : undefined;
  const actualProviderId = runtime?.finalProviderId
    ? String(runtime.finalProviderId)
    : response?.providerId
      ? String(response.providerId)
      : undefined;
  const actualModelId = runtime?.finalModelId
    ? String(runtime.finalModelId)
    : resolveActualModelFromAttemptHistory(runtime?.attemptHistory) ??
      routedModelId;
  const fallbackUsed =
    Boolean(
      actualProviderId &&
        routedProviderId &&
        actualProviderId !== routedProviderId,
    ) ||
    (runtime?.failoverCount ?? 0) > 0;
  const fallbackReason = fallbackUsed
    ? resolveFallbackReason(runtime?.attemptHistory, routedProviderId, actualProviderId)
    : undefined;

  return {
    success: effectiveSuccess,
    awaitingToolApproval,
    ...(resultText !== undefined ? { resultText } : {}),
    ...(structuredData !== undefined ? { structuredData } : {}),
    ...(documentPlanRecovered ? { documentPlanRecovered: true } : {}),
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
    postProcessingComplete: report.stagesCompleted.includes("provider_runtime"),
    errorMessage: effectiveSuccess
      ? undefined
      : websiteMissingDeliverable
        ? runtimeError && !/missing <\/html>/i.test(runtimeError)
          ? runtimeError
          : websiteIncompleteErrorMessage(preferredStack)
        : documentMissingDeliverable
          ? "Document generation finished without a valid DocumentPlan (title + sections)."
        : (() => {
          const stageMsg = report.trace.stages
            ?.slice()
            .reverse()
            .find(
              (s) =>
                s.stage === failedStage &&
                s.status === "failed" &&
                typeof s.message === "string" &&
                s.message.trim().length > 0
            )?.message;
          if (failedStage && stageMsg) return `failed at ${failedStage}: ${stageMsg}`;
          if (failedStage) return `failed at ${failedStage}`;
          return "direct execution failed";
        })(),
    executionMode,
    providerMode,
    capabilityId: report.artifacts.task?.capabilityMap?.primary,
    provider: actualProviderId,
    model: actualModelId,
    providerId: actualProviderId,
    modelId: actualModelId,
    actualProviderId,
    actualModelId,
    routedProviderId,
    routedModelId,
    fallbackUsed,
    ...(fallbackUsed
      ? {
          fallbackProviderId: actualProviderId,
          fallbackModelId: actualModelId,
          fallbackReason,
        }
      : {}),
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    providerLatencyMs: runtime?.statistics.totalMs,
    providerRequestId: response?.providerRequestId,
  };
}

function resolveActualModelFromAttemptHistory(
  attemptHistory?: readonly {
    readonly success: boolean;
    readonly modelId: string;
  }[],
): string | undefined {
  if (!attemptHistory?.length) return undefined;
  const successful = [...attemptHistory].reverse().find((entry) => entry.success);
  return successful?.modelId ? String(successful.modelId) : undefined;
}

function resolveFallbackReason(
  attemptHistory?: readonly {
    readonly primaryOrFailover: "primary" | "failover";
    readonly providerId: string;
    readonly success: boolean;
    readonly failureCategory?: string;
  }[],
  routedProviderId?: string,
  actualProviderId?: string,
): string {
  if (attemptHistory?.length) {
    const failedPrimary = attemptHistory.find(
      (entry) =>
        entry.primaryOrFailover === "primary" &&
        !entry.success &&
        entry.providerId === routedProviderId,
    );
    if (failedPrimary?.failureCategory) return failedPrimary.failureCategory;
  }
  if (routedProviderId && actualProviderId && routedProviderId !== actualProviderId) {
    return "provider_failover";
  }
  return "provider_failover";
}

/** Keep enough text to recover DocumentPlan / PresentationPlan JSON from content. */
const MAX_RESULT_TEXT = 200_000;

function parseWebsiteLike(
  data: unknown,
  options?: { readonly preferredStack?: string }
): boolean {
  return Boolean(recoverWebProjectPlan(data, options));
}

function looksLikeDocumentPlan(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const sections = Array.isArray(row.sections) ? row.sections : [];
  if (title && sections.length > 0) {
    const ok = sections.some((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return false;
      }
      const item = section as Record<string, unknown>;
      const heading =
        typeof item.heading === "string"
          ? item.heading.trim()
          : typeof item.title === "string"
            ? item.title.trim()
            : "";
      const body =
        typeof item.body === "string"
          ? item.body.trim()
          : typeof item.content === "string"
            ? item.content.trim()
            : typeof item.description === "string"
              ? item.description.trim()
              : "";
      return Boolean(heading && body);
    });
    if (ok) return true;
  }
  // Recover LaunchPlan-shaped near-misses (steps with title/description).
  const steps = Array.isArray(row.steps) ? row.steps : [];
  if (title && steps.length >= 3) {
    return steps.some((step) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return false;
      const item = step as Record<string, unknown>;
      const heading =
        typeof item.title === "string"
          ? item.title.trim()
          : typeof item.heading === "string"
            ? item.heading.trim()
            : "";
      const body =
        typeof item.description === "string"
          ? item.description.trim()
          : typeof item.body === "string"
            ? item.body.trim()
            : "";
      return Boolean(heading && body);
    });
  }
  return false;
}

function extractFullResultText(
  output: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  if (!output) return undefined;
  for (const key of ["content", "text", "message"] as const) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

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

  // Anthropic json_schema → tool_use often lands only as content JSON.
  const fromContent = tryParseJsonObject(output.content);
  if (fromContent) return fromContent;
  const fromText = tryParseJsonObject(output.text);
  if (fromText) return fromText;
  return undefined;
}

function tryParseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function assertRoutingMatchesDispatch(
  report: DirectExecutionReport
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
