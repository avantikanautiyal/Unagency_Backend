/**
 * Maps direct execution report → distributed job summary (safe metadata only).
 */

import {
  explicitPreferredStackFromMetadata,
  recoverWebProjectPlan,
  recoverWebsiteRoutesPlan,
  websiteIncompleteErrorMessage,
} from "../../../os/delivery/website-generation";
import { synthesizeDocumentPlanFromText } from "../../../os/delivery/document-generation";
import { recoverPresentationRoutesPayload } from "../../../os/delivery/document-export-service";
import type { DirectExecutionReport } from "../../../direct/contracts";
import type { EnterpriseApiExecutionMode } from "../../../api/runtime/execution-mode";
import { resolveCdfPhaseExecutionContract } from "../../../cdf/canonical";
import { requiresCanonicalEmissionSchema } from "../../../cdf/structured-output-contract";
import {
  CDF_STRUCTURED_PAYLOAD_MISSING,
  hashStructuredPayload,
} from "../../../cdf/structured-execution-result";
import { isDocumentDirectCreate } from "../../../direct/document-direct-metadata";

export const CDF_STRUCTURED_OUTPUT_MISSING = "CDF_STRUCTURED_OUTPUT_MISSING";

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

  const metaEarly = (report.request?.metadata ??
    (report.artifacts as { task?: { metadata?: unknown } } | undefined)?.task
      ?.metadata) as Readonly<Record<string, unknown>> | undefined;
  const resultText = extractSafeResultText(response?.output);
  const emissionContractEarly = resolveCdfPhaseExecutionContract({
    serviceId:
      typeof metaEarly?.cdfServiceId === "string"
        ? metaEarly.cdfServiceId
        : typeof metaEarly?.serviceId === "string"
          ? metaEarly.serviceId
          : undefined,
    phaseId:
      typeof metaEarly?.cdfPhaseId === "string"
        ? metaEarly.cdfPhaseId
        : undefined,
  });
  const emissionRequired =
    emissionContractEarly != null &&
    requiresCanonicalEmissionSchema(emissionContractEarly);
  let structuredData = extractStructuredData(response?.output, {
    emissionRequired,
  });
  let structuredEmissionData: unknown | undefined;
  let structuredContractName: string | undefined;
  let structuredPayloadHash: string | undefined;
  let structuredSchemaVersion: string | undefined;
  if (structuredData != null) {
    if (emissionRequired) {
      structuredEmissionData = structuredData;
      structuredContractName =
        emissionContractEarly?.structuredOutputContract?.name ??
        (typeof metaEarly?.structuredOutput === "object" &&
        metaEarly.structuredOutput &&
        typeof (metaEarly.structuredOutput as { name?: unknown }).name ===
          "string"
          ? String((metaEarly.structuredOutput as { name: string }).name)
          : undefined);
      structuredSchemaVersion =
        emissionContractEarly?.structuredOutputContract?.version ?? "1";
      structuredPayloadHash = hashStructuredPayload(structuredData);
    }
    structuredData = recoverPresentationRoutesPayload(structuredData);
    if (structuredEmissionData != null) {
      structuredEmissionData = recoverPresentationRoutesPayload(
        structuredEmissionData,
      );
      structuredPayloadHash = hashStructuredPayload(structuredEmissionData);
    }
  }
  const preferredStack = explicitPreferredStackFromMetadata(metaEarly);
  const recoverOpts = preferredStack ? { preferredStack } : {};
  // Never rewrite CDF text_choice / creative route payloads into WebProjects.
  // Never rewrite canonical emission structured payloads via website recovery.
  const skipWebsiteRecovery =
    looksLikeTextChoiceStructured(structuredData) || emissionRequired;
  if (!skipWebsiteRecovery && !parseWebsiteLike(structuredData, recoverOpts)) {
    const recovered =
      recoverWebsiteRoutesPlan(structuredData, recoverOpts)?.[0] ??
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
  const outputKindEarly =
    typeof meta?.outputKind === "string"
      ? meta.outputKind.trim().toLowerCase()
      : "";
  const serviceEarly =
    typeof meta?.service === "string"
      ? meta.service.trim().toLowerCase()
      : "";
  const websiteContractName =
    structuredName === "websitepage" ||
    structuredName === "webproject" ||
    structuredName === "websiteroutes";
  // Align with resolveWebsiteExport / isWebsiteGenerationMetadata:
  // product service=website must not force website-job rewriting when CDF
  // sealed outputKind to text (structured approval docs, sitemaps, etc.).
  const isWebsiteJob =
    websiteContractName ||
    outputKindEarly === "deferred_website" ||
    outputKindEarly === "website" ||
    (serviceEarly === "website" &&
      !outputKindEarly &&
      !websiteContractName &&
      structuredName !== "cdfwebsitesitemap" &&
      structuredName !== "cdfwebsitepagestructure" &&
      structuredName !== "cdfstructuredapprovaldoc");
  // Contract/modality/capability over product subtype — print+leaflet must never
  // classify CDF master-artwork (image.generate) or text_choice routes as DocumentPlan.
  const capabilityId =
    typeof report.artifacts.task?.capabilityMap?.primary === "string"
      ? report.artifacts.task.capabilityMap.primary
      : typeof meta?.capabilityId === "string"
        ? meta.capabilityId
        : undefined;
  const isDocumentJob = isDocumentDirectCreate(meta ?? undefined, {
    capabilityId,
  });
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
  // Authoritative actual model comes ONLY from winner stamp / attempt history.
  // Never reconstruct from routedModelId (cross-vendor mismatch under failover).
  const actualModelId = runtime?.finalModelId
    ? String(runtime.finalModelId)
    : resolveActualModelFromAttemptHistory(runtime?.attemptHistory);

  // Canonical CDF emission phases require real structured JSON — provider
  // success without structuredData is an execution failure (not observational).
  let cdfStructuredMissing = false;
  let cdfStructuredMissingDetail: Record<string, unknown> | undefined;
  {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId:
        typeof meta?.cdfServiceId === "string"
          ? meta.cdfServiceId
          : typeof meta?.serviceId === "string"
            ? meta.serviceId
            : undefined,
      phaseId:
        typeof meta?.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    });
    if (
      contract &&
      requiresCanonicalEmissionSchema(contract) &&
      report.success &&
      !awaitingToolApproval &&
      structuredData == null
    ) {
      cdfStructuredMissing = true;
      const outputContractName =
        typeof meta?.structuredOutput === "object" &&
        meta.structuredOutput &&
        typeof (meta.structuredOutput as { name?: unknown }).name === "string"
          ? String((meta.structuredOutput as { name: string }).name)
          : contract.structuredOutputContract?.name;
      cdfStructuredMissingDetail = {
        reason: CDF_STRUCTURED_PAYLOAD_MISSING,
        legacyReason: CDF_STRUCTURED_OUTPUT_MISSING,
        executionId:
          typeof meta?.apiExecutionId === "string"
            ? meta.apiExecutionId
            : typeof meta?.executionId === "string"
              ? meta.executionId
              : undefined,
        artifactKey: contract.artifactKey,
        outputContractName,
        structuredContractName: outputContractName,
        provider: actualProviderId,
        model: actualModelId,
        schemaIdentity: outputContractName ?? contract.artifactKey,
        responseKind: "unstructured",
        responseParsingStatus: "missing_structured_data",
      };
    }
  }

  const effectiveSuccess =
    awaitingToolApproval ||
    websiteMissingDeliverable ||
    documentMissingDeliverable ||
    cdfStructuredMissing
      ? false
      : report.success;

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
    ...(structuredEmissionData !== undefined
      ? { structuredEmissionData }
      : {}),
    ...(structuredContractName
      ? { structuredContractName }
      : {}),
    ...(structuredSchemaVersion
      ? { structuredSchemaVersion }
      : {}),
    ...(structuredPayloadHash
      ? { structuredPayloadHash }
      : {}),
    ...(documentPlanRecovered ? { documentPlanRecovered: true } : {}),
    ...(cdfStructuredMissingDetail
      ? { cdfStructuredOutputMissing: cdfStructuredMissingDetail }
      : {}),
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
    // A provider failure is the failure — "missing deliverable" messages only
    // describe a provider success that lacked the contract output.
    errorMessage: effectiveSuccess
      ? undefined
      : report.success !== true
        ? providerFailureMessage(report, failedStage)
      : cdfStructuredMissing
        ? `${CDF_STRUCTURED_OUTPUT_MISSING}: canonical CDF phase completed without structured output`
      : websiteMissingDeliverable
        ? runtimeError && !/missing <\/html>/i.test(runtimeError)
          ? runtimeError
          : websiteIncompleteErrorMessage(preferredStack)
        : documentMissingDeliverable
          ? "Document generation finished without a valid DocumentPlan (title + sections)."
        : providerFailureMessage(report, failedStage),
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
    failoverCount: runtime?.failoverCount ?? 0,
    ...(runtime?.attemptHistory?.length
      ? { attemptHistory: runtime.attemptHistory }
      : {}),
    ...(runtime?.fallbackDiagnostics
      ? { fallbackDiagnostics: runtime.fallbackDiagnostics }
      : {}),
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
  return Boolean(
    recoverWebsiteRoutesPlan(data, options)?.length ||
      recoverWebProjectPlan(data, options),
  );
}

/** Creative / CDF text_choice route cards — do not website-recover. */
function looksLikeTextChoiceStructured(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.routes) || d.routes.length === 0) return false;
  if (Array.isArray(d.files) && d.files.length > 0) return false;
  if (typeof d.html === "string" && d.html.trim()) return false;
  if (typeof d.stack === "string" && d.stack.trim()) return false;
  return d.routes.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const r = item as Record<string, unknown>;
    return (
      typeof r.creativeIdea === "string" ||
      typeof r.visualTreatment === "string" ||
      typeof r.headlineAngle === "string" ||
      typeof r.idea === "string" ||
      typeof r.rationale === "string"
    );
  });
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
  output: Readonly<Record<string, unknown>> | undefined,
  options?: { readonly emissionRequired?: boolean },
): unknown | undefined {
  if (!output) return undefined;

  const validFlag =
    output.structuredOutputValid === true ||
    (output.toolOrchestration &&
      typeof output.toolOrchestration === "object" &&
      (output.toolOrchestration as { structuredOutputValid?: unknown })
        .structuredOutputValid === true);
  const explicitlyInvalid =
    output.structuredOutputValid === false ||
    (output.toolOrchestration &&
      typeof output.toolOrchestration === "object" &&
      (output.toolOrchestration as { structuredOutputValid?: unknown })
        .structuredOutputValid === false);

  // Authoritative provider-attached structured payload.
  if (output.structured != null) {
    if (options?.emissionRequired && explicitlyInvalid && !validFlag) {
      return undefined;
    }
    return output.structured;
  }
  if (output.structuredOutput != null) {
    if (options?.emissionRequired && explicitlyInvalid && !validFlag) {
      return undefined;
    }
    return output.structuredOutput;
  }
  if (output.data != null && typeof output.data === "object") {
    if (options?.emissionRequired && explicitlyInvalid && !validFlag) {
      return undefined;
    }
    return output.data;
  }

  // Canonical emission phases must not treat content-parsed JSON as structured
  // success when the provider never attached validated output.structured —
  // that creates structuredPresent=true with runtimeStructuredPresent=false.
  if (options?.emissionRequired) {
    return undefined;
  }

  // Anthropic json_schema → tool_use often lands only as content JSON (legacy).
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

function providerFailureMessage(
  report: { readonly trace: { readonly stages?: readonly { readonly stage: string; readonly status: string; readonly message?: string }[] } },
  failedStage: string | undefined,
): string {
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
}
