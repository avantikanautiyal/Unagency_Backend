/**
 * P4.9.3 — Structured website materialization diagnostics (no prompts/secrets).
 */

import { logOsExecutionEvent } from "../../os/observability/execution-log";
import { isAsyncMediaEnabled } from "../../infrastructure/durability/create-async-media-platform";
import {
  explicitPreferredStackFromMetadata,
  extractWebsiteBrandName,
  recoverWebsiteRoutesPlan,
  type WebsiteRelevanceResult,
} from "../../os/delivery/website-generation";
import { resolveBriefObjectiveFromMetadata } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";

export type WebsiteMaterializationDiagnosticInput = {
  readonly executionId: string;
  readonly phase:
    | "attempt"
    | "skipped_already_materialized"
    | "skipped_settled_failure"
    | "skipped_not_website"
    | "skipped_awaiting_output"
    | "failed"
    | "succeeded";
  readonly path?: "worker" | "dispatch_sync" | "dispatch_finalize" | "poll_hydrate";
  readonly executionKind?: "fresh" | "retry" | "recovered_job" | "idempotent_replay";
  readonly executionSpecSupplied?: boolean;
  readonly asyncMediaPresent?: boolean;
  readonly asyncMediaEnabled?: boolean;
  readonly asyncMediaProductionBacked?: boolean;
  readonly structuredDataPresent?: boolean;
  readonly websiteRoutesCount?: number;
  readonly providerDeclaredStack?: string;
  readonly metadataPreferredStack?: string;
  readonly materializationAttempted?: boolean;
  readonly exported?: boolean;
  readonly artifactIds?: readonly string[];
  readonly errorCode?: string;
  readonly skipReason?: string;
  readonly briefObjectiveSource?: string;
  readonly brandNameSource?: string;
  readonly relevanceOk?: boolean;
  readonly relevanceReasons?: string;
  readonly routeIdentifiers?: string;
};

export function executionSpecSuppliedFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  return Boolean(
    metadata?.executionSpecSnapshot ||
      metadata?.executionSpecHandoff ||
      metadata?.executionSpecId ||
      metadata?.executionSpecPlaneVersion ||
      metadata?.executionSpecResolutionState,
  );
}

/** Canonical brief for website relevance — executionSpec first, then client handoff fields. */
export function resolveWebsiteMaterializationBrief(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly fallbackPrompt?: string;
}): { brief: string; source: string } {
  const fromSpec = resolveBriefObjectiveFromMetadata(
    input.metadata,
    input.fallbackPrompt,
  );
  if (fromSpec?.trim()) {
    return { brief: fromSpec.trim(), source: "executionSpec" };
  }

  const fromMeta =
    typeof input.metadata?.websiteUserBrief === "string"
      ? input.metadata.websiteUserBrief.trim()
      : "";
  if (fromMeta) return { brief: fromMeta, source: "websiteUserBrief" };

  const fromJob =
    typeof input.jobSummary?.websiteUserBrief === "string"
      ? input.jobSummary.websiteUserBrief.trim()
      : "";
  if (fromJob) return { brief: fromJob, source: "jobSummary.websiteUserBrief" };

  const fromRuntime =
    typeof input.runtimeOutput?.websiteUserBrief === "string"
      ? input.runtimeOutput.websiteUserBrief.trim()
      : "";
  if (fromRuntime) {
    return { brief: fromRuntime, source: "runtimeOutput.websiteUserBrief" };
  }

  const prompt = input.fallbackPrompt?.trim() ?? "";
  return prompt
    ? { brief: prompt, source: "fallbackPrompt" }
    : { brief: "", source: "none" };
}

export function resolveWebsiteMaterializationBrand(input: {
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): { brandName?: string; source?: string } {
  const fromBrief = extractWebsiteBrandName(input.brief);
  if (fromBrief) return { brandName: fromBrief, source: "brief" };

  const required =
    typeof input.metadata?.requiredBrandName === "string"
      ? input.metadata.requiredBrandName.trim()
      : "";
  if (required) return { brandName: required, source: "requiredBrandName" };

  const brand =
    typeof input.metadata?.brandName === "string"
      ? input.metadata.brandName.trim()
      : "";
  if (brand) return { brandName: brand, source: "brandName" };

  return {};
}

export function readWebsiteMaterializationContext(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly structuredData?: unknown;
  readonly asyncMediaPresent?: boolean;
  readonly asyncMediaProductionBacked?: boolean;
}): {
  executionSpecSupplied: boolean;
  structuredDataPresent: boolean;
  websiteRoutesCount: number;
  providerDeclaredStack?: string;
  metadataPreferredStack?: string;
} {
  const executionSpecSupplied = executionSpecSuppliedFromMetadata(
    input.metadata,
  );
  const routes =
    recoverWebsiteRoutesPlan(input.structuredData, {
      preferredStack: explicitPreferredStackFromMetadata(input.metadata),
    }) ?? [];
  const first = routes[0];
  return {
    executionSpecSupplied,
    structuredDataPresent: routes.length > 0,
    websiteRoutesCount: routes.length,
    ...(first?.stack ? { providerDeclaredStack: first.stack } : {}),
    metadataPreferredStack: explicitPreferredStackFromMetadata(input.metadata),
  };
}

export function logWebsiteMaterializationDiagnostic(
  input: WebsiteMaterializationDiagnosticInput,
): void {
  logOsExecutionEvent("execution.website_materialization.diagnostic", {
    executionId: input.executionId,
    status: input.phase,
    ...(input.path ? { path: input.path } : {}),
    ...(input.executionKind ? { executionKind: input.executionKind } : {}),
    ...(input.executionSpecSupplied != null
      ? { executionSpecSupplied: input.executionSpecSupplied }
      : {}),
    ...(input.asyncMediaPresent != null
      ? { asyncMediaPresent: input.asyncMediaPresent }
      : {}),
    ...(input.asyncMediaEnabled != null
      ? { asyncMediaEnabled: input.asyncMediaEnabled }
      : {}),
    ...(input.asyncMediaProductionBacked != null
      ? { asyncMediaProductionBacked: input.asyncMediaProductionBacked }
      : {}),
    ...(input.structuredDataPresent != null
      ? { structuredDataPresent: input.structuredDataPresent }
      : {}),
    ...(input.websiteRoutesCount != null
      ? { websiteRoutesCount: input.websiteRoutesCount }
      : {}),
    ...(input.providerDeclaredStack
      ? { providerDeclaredStack: input.providerDeclaredStack }
      : {}),
    ...(input.metadataPreferredStack
      ? { metadataPreferredStack: input.metadataPreferredStack }
      : {}),
    ...(input.materializationAttempted != null
      ? { materializationAttempted: input.materializationAttempted }
      : {}),
    ...(input.exported != null ? { exported: input.exported } : {}),
    ...(input.artifactIds?.length
      ? { artifactIds: input.artifactIds.join(",") }
      : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.skipReason ? { skipReason: input.skipReason } : {}),
    ...(input.briefObjectiveSource
      ? { briefObjectiveSource: input.briefObjectiveSource }
      : {}),
    ...(input.brandNameSource ? { brandNameSource: input.brandNameSource } : {}),
    ...(input.relevanceOk != null ? { relevanceOk: input.relevanceOk } : {}),
    ...(input.relevanceReasons
      ? { relevanceReasons: input.relevanceReasons }
      : {}),
    ...(input.routeIdentifiers
      ? { routeIdentifiers: input.routeIdentifiers }
      : {}),
    asyncMediaEnabledEnv: isAsyncMediaEnabled(process.env),
  });
}

export function websiteRelevanceDiagnosticSummary(
  relevance: WebsiteRelevanceResult,
): string {
  return [
    `ok=${relevance.ok}`,
    `reasons=${relevance.reasons.join(",") || "none"}`,
    `anchors=${relevance.anchorHits}/${relevance.anchorTotal}`,
  ].join(";");
}

export function websiteMaterializationUserMessage(errorCode?: string): string {
  const code = (errorCode ?? "").trim();
  const upper = code.toUpperCase();
  if (upper === "WEBSITE_BRIEF_RELEVANCE") {
    return "Website output was not grounded in your brief. Please try again with a clear brand name and requirements.";
  }
  if (upper === "WEBSITE_MATERIALIZATION_FAILURE") {
    return "The website was generated but could not be saved as a preview file. Please retry.";
  }
  const lower = code.toLowerCase();
  if (
    lower.includes("async media") ||
    lower.includes("enterprise_async_media_enabled")
  ) {
    return "Website preview storage is unavailable in this environment. The page was generated but could not be saved for preview.";
  }
  if (lower.includes("valid webproject") || lower.includes("export_failed")) {
    return "The website was generated but could not be saved as a preview file. Please retry.";
  }
  if (lower.includes("website_brief_relevance") || lower.includes("relevance")) {
    return "Website output was not grounded in your brief. Please try again with a clear brand name and requirements.";
  }
  return "The website was generated but artifact materialization failed. Please retry.";
}
