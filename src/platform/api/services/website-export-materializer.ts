/**
 * After structured WebProject / WebsiteRoutes output, materialize preview + project artifacts.
 * html-static → live HTML preview; all stacks → zip codebase download.
 * Multi-route: up to 3 directions, each with its own zip (+ optional HTML preview).
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { ExecutionResultPayload } from "../contracts";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  buildWebProjectZip,
  isHtmlStaticPreviewable,
  explicitPreferredStackFromMetadata,
  recoverWebProjectPlan,
  recoverWebsiteRoutesPlan,
  resolveWebsiteBrandColors,
  validateWebsitePageRelevance,
  webProjectToLegacyPage,
  type WebProjectPlan,
  type WebsitePagePlan,
  type WebsiteRoutePlan,
  type WebStack,
  type WebsiteRelevanceResult,
} from "../../os/delivery/website-generation";
import { stampHeroImageOntoWebProject } from "../../os/delivery/website-project-templates";
import {
  extractReferenceLogoFromMetadata,
  generateBestEffortVisualImage,
  toDataUrl,
  type BestEffortVisualImageDeps,
} from "../../os/delivery/best-effort-visual-image";
import { stampWebsiteExportPreview } from "./execution-result-payload";
import {
  logWebsiteMaterializationDiagnostic,
  readWebsiteMaterializationContext,
  resolveWebsiteMaterializationBrief,
  resolveWebsiteMaterializationBrand,
  websiteRelevanceDiagnosticSummary,
} from "./website-materialization-diagnostics";

const HTML_MIME = "text/html; charset=utf-8";
const ZIP_MIME = "application/zip";

export const WEBSITE_BRIEF_RELEVANCE_ERROR = "WEBSITE_BRIEF_RELEVANCE";
export const WEBSITE_MATERIALIZATION_FAILURE_ERROR =
  "WEBSITE_MATERIALIZATION_FAILURE";

function websiteMaterializationErrorCode(error: ValidationError): string {
  const details = error.details as { websiteRelevance?: unknown } | undefined;
  if (details?.websiteRelevance) return WEBSITE_BRIEF_RELEVANCE_ERROR;
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("not grounded") || msg.includes("relevance")) {
    return WEBSITE_BRIEF_RELEVANCE_ERROR;
  }
  return WEBSITE_MATERIALIZATION_FAILURE_ERROR;
}

export type { WebsitePagePlan, WebProjectPlan };

export const normalizeWebsiteHtml = (
  raw: string
): string => recoverWebProjectPlan(raw)?.files[0]?.content ?? raw.trim();

export function parseWebProject(
  data: unknown,
  preferredStack?: WebStack | string,
  brandColors?: readonly string[]
): WebProjectPlan | null {
  return recoverWebProjectPlan(data, {
    ...(preferredStack ? { preferredStack } : {}),
    ...(brandColors?.length ? { brandColors } : {}),
  });
}

function recoverOptsFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): {
  preferredStack?: WebStack;
  brandColors?: string[];
} {
  const preferredStack = explicitPreferredStackFromMetadata(metadata);
  const brandColors = resolveWebsiteBrandColors(
    metadata,
    typeof metadata?.websiteUserBrief === "string"
      ? metadata.websiteUserBrief
      : "",
  );
  return {
    ...(preferredStack ? { preferredStack } : {}),
    ...(brandColors.length ? { brandColors } : {}),
  };
}

function pickStructuredData(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined,
  jobSummary: Readonly<Record<string, unknown>> | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): unknown {
  const opts = recoverOptsFromMetadata(metadata);
  const fromJobStructured = jobSummary?.structuredData;
  const fromJobText =
    typeof jobSummary?.resultText === "string" ? jobSummary.resultText : undefined;
  const fromRuntimeStructured = runtimeOutput?.structured;
  const fromRuntimeStructuredOutput = runtimeOutput?.structuredOutput;
  const fromRuntimeData =
    runtimeOutput?.data != null ? runtimeOutput.data : undefined;
  const fromRuntimeContent =
    typeof (runtimeOutput as Record<string, unknown> | undefined)?.content ===
    "string"
      ? (runtimeOutput as Record<string, unknown>).content
      : undefined;
  const fromRuntimeText =
    typeof (runtimeOutput as Record<string, unknown> | undefined)?.text === "string"
      ? (runtimeOutput as Record<string, unknown>).text
      : undefined;

  const candidates = [
    fromJobStructured,
    fromRuntimeStructured,
    fromRuntimeStructuredOutput,
    fromRuntimeData,
    fromJobText,
    fromRuntimeContent,
    fromRuntimeText,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (recoverWebsiteRoutesPlan(candidate, opts)?.length) {
      return candidate;
    }
    if (recoverWebProjectPlan(candidate, opts)) {
      return candidate;
    }
  }
  return undefined;
}

function materializationAlreadySettled(input: {
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string | undefined {
  const fromJob =
    typeof input.jobSummary?.websiteMaterializationErrorCode === "string"
      ? input.jobSummary.websiteMaterializationErrorCode.trim()
      : "";
  if (fromJob) return fromJob;
  const fromMeta =
    typeof input.metadata?.websiteMaterializationErrorCode === "string"
      ? input.metadata.websiteMaterializationErrorCode.trim()
      : "";
  return fromMeta || undefined;
}

function routeIdentifiers(
  routes: readonly { title?: string; stack?: string }[],
): string {
  return routes
    .slice(0, 3)
    .map((r, i) => `${i}:${(r.title ?? "untitled").slice(0, 48)}:${r.stack ?? "?"}`)
    .join("|");
}

function websiteExportAlreadyMaterialized(input: {
  readonly currentResult?: ExecutionResultPayload;
  readonly currentArtifactIds?: readonly string[];
}): boolean {
  if (existingHtmlArtifactId(input.currentResult)) return true;
  if (existingProjectArtifactId(input.currentResult)) return true;
  return (input.currentArtifactIds?.length ?? 0) > 0;
}

export function resolveWebsiteExport(input: {
  outputKind?: string;
  service?: string;
  structuredName?: string;
  data?: unknown;
}): boolean {
  const kind = (input.outputKind ?? "").toLowerCase();
  const service = (input.service ?? "").toLowerCase();
  const name = (input.structuredName ?? "").toLowerCase();
  if (
    kind === "deferred_website" ||
    kind === "website" ||
    name === "websitepage" ||
    name === "webproject" ||
    name === "websiteroutes"
  ) {
    return true;
  }
  if (service === "website") return true;
  // Do not infer website export from LaunchPlan / DocumentPlan / prose that
  // merely shares title+summary keys — that corrupts text creative routes.
  if (
    name === "launchplan" ||
    name === "documentplan" ||
    name === "emailplan" ||
    name === "presentationplan" ||
    name === "presentationroutes" ||
    name === "presentationrouteconcepts" ||
    kind === "text" ||
    kind === "document" ||
    kind === "email" ||
    kind === "presentation"
  ) {
    return false;
  }
  return Boolean(parseWebProject(input.data));
}

type MaterializedRoute = WebsiteRoutePlan & {
  exportKind: "website";
  techStack: string;
  html: string;
  htmlArtifactId?: string;
  projectArtifactId?: string;
  downloadFormats: string[];
  description?: string;
};

async function materializeOneProject(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly createId: (prefix: string) => string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly project: WebsiteRoutePlan;
  readonly outputOffset: number;
}): Promise<
  Result<{ artifactIds: string[]; route: MaterializedRoute }>
> {
  const project = input.project;
  const legacy = webProjectToLegacyPage(project);
  const artifactIds: string[] = [];
  let htmlArtifactId: string | undefined;
  let projectArtifactId: string | undefined;
  const downloadFormats: string[] = [];
  const operationId = input.createId(`webexport${input.outputOffset}`);

  {
    const artifactId = input.asyncMedia.artifacts.buildArtifactId(
      operationId,
      input.outputOffset
    );
    const buffer = await buildWebProjectZip(project);
    const ingested = await input.asyncMedia.ingestion.ingest({
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId,
      outputIndex: input.outputOffset,
      base64: buffer.toString("base64"),
      mimeType: ZIP_MIME,
    });
    if (!ingested.ok) return ingested;
    await input.asyncMedia.artifacts.finalize({
      operationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      outputIndex: input.outputOffset,
      blob: ingested.value,
      providerId: input.providerId ?? "provider.unagency",
      modelId: input.modelId ?? "web-project-export",
      capabilityId: "output.landing_page",
    });
    projectArtifactId = artifactId;
    artifactIds.push(artifactId);
    downloadFormats.push("zip");
  }

  if (isHtmlStaticPreviewable(project) && legacy.html.trim()) {
    const artifactId = input.asyncMedia.artifacts.buildArtifactId(
      operationId,
      input.outputOffset + 1
    );
    const buffer = Buffer.from(legacy.html, "utf8");
    const ingested = await input.asyncMedia.ingestion.ingest({
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId,
      outputIndex: input.outputOffset + 1,
      base64: buffer.toString("base64"),
      mimeType: HTML_MIME,
    });
    if (!ingested.ok) return ingested;
    await input.asyncMedia.artifacts.finalize({
      operationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      outputIndex: input.outputOffset + 1,
      blob: ingested.value,
      providerId: input.providerId ?? "provider.unagency",
      modelId: input.modelId ?? "website-export",
      capabilityId: "output.landing_page",
    });
    htmlArtifactId = artifactId;
    artifactIds.push(artifactId);
    downloadFormats.push("html");
  }

  return success({
    artifactIds,
    route: {
      ...project,
      techStack: project.stack,
      html: legacy.html,
      exportKind: "website",
      ...(htmlArtifactId ? { htmlArtifactId } : {}),
      ...(projectArtifactId ? { projectArtifactId } : {}),
      downloadFormats,
      ...(project.description ? { description: project.description } : {}),
    },
  });
}

export async function materializeWebsiteExport(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createId: (prefix: string) => string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly visualImageDeps?: BestEffortVisualImageDeps;
}): Promise<
  Result<{
    artifactIds: string[];
    htmlArtifactId?: string;
    projectArtifactId?: string;
    plan: MaterializedRoute & {
      routes?: MaterializedRoute[];
    };
  }>
> {
  const data = pickStructuredData(
    input.runtimeOutput,
    input.jobSummary,
    input.metadata,
  );
  const recoveredFromRaw = typeof data === "string";
  const opts = recoverOptsFromMetadata(input.metadata);
  const routes =
    recoverWebsiteRoutesPlan(data, {
      preferredStack: opts.preferredStack,
      brandColors: opts.brandColors,
    }) ?? [];
  if (routes.length === 0) {
    return failure(
      new ValidationError("Structured output is not a valid WebProject")
    );
  }

  const briefResolution = resolveWebsiteMaterializationBrief({
    metadata: input.metadata,
    jobSummary: input.jobSummary,
    runtimeOutput: input.runtimeOutput,
  });
  const brief = briefResolution.brief;
  const brandResolution = resolveWebsiteMaterializationBrand({
    brief,
    metadata: input.metadata,
  });
  const brandName = brandResolution.brandName;

  // Provider relevance gate validates the primary route only; alternate creative
  // directions may explore variants without repeating every brief anchor.
  const primaryRoute = routes[0]!;
  const relevance = validateWebsitePageRelevance({
    data: primaryRoute,
    userBrief: brief,
    brandName,
  });
  if (!relevance.ok && brief.trim() && !recoveredFromRaw) {
    return failure(
      new ValidationError(
        "Website output was not grounded in your brief. Please try again with a clear brand name and requirements.",
        {
          websiteRelevance: relevance,
          errorCode: WEBSITE_BRIEF_RELEVANCE_ERROR,
          briefObjectiveSource: briefResolution.source,
          brandNameSource: brandResolution.source,
          routeIdentifiers: routeIdentifiers(routes),
        },
      ),
    );
  }

  const visualDeps: BestEffortVisualImageDeps | undefined =
    input.visualImageDeps
      ? {
          ...input.visualImageDeps,
          organizationId: input.organizationId,
          executionId: input.executionId,
          createId: input.createId,
        }
      : undefined;

  const artifactIds: string[] = [];
  const materialized: MaterializedRoute[] = [];
  let outputOffset = 0;
  for (const project of routes.slice(0, 3)) {
    let enriched: WebsiteRoutePlan = project;
    try {
      const heroPrompt = [
        `Website hero visual for ${project.title || brandName || "brand"}`,
        project.summary,
        brief ? `Brief mood: ${brief.slice(0, 400)}` : "",
      ]
        .filter(Boolean)
        .join(". ");
      const hero = await generateBestEffortVisualImage({
        prompt: heroPrompt,
        brandColors: opts.brandColors,
        referenceLogo: extractReferenceLogoFromMetadata(input.metadata),
        deps: visualDeps,
      });
      if (hero) {
        enriched = {
          ...stampHeroImageOntoWebProject(project, toDataUrl(hero)),
          ...(project.description ? { description: project.description } : {}),
        };
      }
    } catch (err) {
      console.warn(
        `[website-export] hero image skipped: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const one = await materializeOneProject({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
      project: enriched,
      outputOffset,
    });
    if (!one.ok) return one;
    artifactIds.push(...one.value.artifactIds);
    materialized.push(one.value.route);
    outputOffset += 2;
  }

  const primary = materialized[0]!;
  return success({
    artifactIds,
    ...(primary.htmlArtifactId
      ? { htmlArtifactId: primary.htmlArtifactId }
      : {}),
    ...(primary.projectArtifactId
      ? { projectArtifactId: primary.projectArtifactId }
      : {}),
    plan: {
      ...primary,
      ...(materialized.length > 1 ? { routes: materialized } : {}),
    },
  });
}

function existingHtmlArtifactId(
  result?: ExecutionResultPayload
): string | undefined {
  const data = result?.data;
  if (!data || typeof data !== "object") return undefined;
  const id = (data as { htmlArtifactId?: unknown }).htmlArtifactId;
  return typeof id === "string" && id.trim() ? id : undefined;
}

function existingProjectArtifactId(
  result?: ExecutionResultPayload
): string | undefined {
  const data = result?.data;
  if (!data || typeof data !== "object") return undefined;
  const id = (data as { projectArtifactId?: unknown }).projectArtifactId;
  return typeof id === "string" && id.trim() ? id : undefined;
}

/**
 * After a background website job completes, attach project + preview artifacts.
 * Safe to call on every poll — no-ops when already exported.
 */
export async function applyWebsiteExportToExecution(input: {
  readonly asyncMedia?: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly status: string;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createId: (prefix: string) => string;
  readonly currentResult?: ExecutionResultPayload;
  readonly currentArtifactIds?: readonly string[];
  readonly path?: "worker" | "dispatch_sync" | "dispatch_finalize" | "poll_hydrate";
  readonly executionKind?: "fresh" | "retry" | "recovered_job" | "idempotent_replay";
  readonly visualImageDeps?: BestEffortVisualImageDeps;
}): Promise<{
  result: ExecutionResultPayload;
  artifactIds?: string[];
  exported: boolean;
  errorCode?: string;
}> {
  const structuredData = pickStructuredData(
    input.runtimeOutput,
    input.jobSummary,
    input.metadata,
  );
  const diagContext = readWebsiteMaterializationContext({
    metadata: input.metadata,
    structuredData,
    asyncMediaPresent: Boolean(input.asyncMedia),
  });
  const briefResolution = resolveWebsiteMaterializationBrief({
    metadata: input.metadata,
    jobSummary: input.jobSummary,
    runtimeOutput: input.runtimeOutput,
  });
  const brandResolution = resolveWebsiteMaterializationBrand({
    brief: briefResolution.brief,
    metadata: input.metadata,
  });

  const settledError = materializationAlreadySettled(input);
  if (settledError) {
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "skipped_settled_failure",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: Boolean(input.asyncMedia),
      structuredDataPresent: diagContext.structuredDataPresent,
      websiteRoutesCount: diagContext.websiteRoutesCount,
      providerDeclaredStack: diagContext.providerDeclaredStack,
      metadataPreferredStack: diagContext.metadataPreferredStack,
      materializationAttempted: false,
      exported: false,
      errorCode: settledError,
      skipReason: "settled_failure",
      briefObjectiveSource: briefResolution.source,
      brandNameSource: brandResolution.source,
    });
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
      errorCode: settledError,
    };
  }

  if (websiteExportAlreadyMaterialized(input)) {
    const stamped =
      stampWebsiteExportPreview({
        result: input.currentResult ?? { kind: "structured", data: {} },
        mediaArtifactIds: input.currentArtifactIds ?? [],
        jobSummary: input.jobSummary,
      }) ?? input.currentResult ?? { kind: "structured", data: {} };
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "skipped_already_materialized",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: Boolean(input.asyncMedia),
      structuredDataPresent: diagContext.structuredDataPresent,
      websiteRoutesCount: diagContext.websiteRoutesCount,
      providerDeclaredStack: diagContext.providerDeclaredStack,
      metadataPreferredStack: diagContext.metadataPreferredStack,
      materializationAttempted: false,
      exported: true,
      artifactIds: input.currentArtifactIds,
      skipReason: "already_materialized",
    });
    return {
      result: stamped,
      artifactIds: input.currentArtifactIds
        ? [...input.currentArtifactIds]
        : undefined,
      exported: true,
    };
  }

  if (input.path === "poll_hydrate" && structuredData == null) {
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "skipped_awaiting_output",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: Boolean(input.asyncMedia),
      structuredDataPresent: false,
      websiteRoutesCount: 0,
      providerDeclaredStack: diagContext.providerDeclaredStack,
      metadataPreferredStack: diagContext.metadataPreferredStack,
      materializationAttempted: false,
      exported: false,
      skipReason: "awaiting_structured_output",
      briefObjectiveSource: briefResolution.source,
      brandNameSource: brandResolution.source,
    });
    return {
      result: input.currentResult ?? { kind: "pending" },
      artifactIds: input.currentArtifactIds
        ? [...input.currentArtifactIds]
        : undefined,
      exported: false,
    };
  }

  const structuredName =
    input.metadata?.structuredOutput &&
    typeof input.metadata.structuredOutput === "object"
      ? String(
          (input.metadata.structuredOutput as { name?: unknown }).name ?? ""
        )
      : "";

  const shouldExport = resolveWebsiteExport({
    outputKind:
      typeof input.metadata?.outputKind === "string"
        ? input.metadata.outputKind
        : undefined,
    service:
      typeof input.metadata?.service === "string"
        ? input.metadata.service
        : undefined,
    structuredName,
    data: pickStructuredData(
      input.runtimeOutput,
      input.jobSummary,
      input.metadata,
    ),
  });

  if (!shouldExport) {
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "skipped_not_website",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: Boolean(input.asyncMedia),
      structuredDataPresent: diagContext.structuredDataPresent,
      websiteRoutesCount: diagContext.websiteRoutesCount,
      materializationAttempted: false,
      exported: false,
      skipReason: "not_website_export",
    });
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
    };
  }

  const websiteRequired =
    (typeof input.metadata?.service === "string" &&
      input.metadata.service.toLowerCase() === "website") ||
    (typeof input.metadata?.outputKind === "string" &&
      /^(deferred_)?website$/i.test(input.metadata.outputKind)) ||
    /^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(structuredName);

  if (!input.asyncMedia) {
    const errorCode = websiteRequired
      ? "Website export requires async media (ENTERPRISE_ASYNC_MEDIA_ENABLED)"
      : undefined;
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: websiteRequired ? "failed" : "skipped_not_website",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: false,
      structuredDataPresent: diagContext.structuredDataPresent,
      websiteRoutesCount: diagContext.websiteRoutesCount,
      providerDeclaredStack: diagContext.providerDeclaredStack,
      metadataPreferredStack: diagContext.metadataPreferredStack,
      materializationAttempted: websiteRequired,
      exported: false,
      errorCode,
      skipReason: websiteRequired ? undefined : "async_media_unavailable",
    });
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
      ...(websiteRequired
        ? {
            errorCode:
              "Website export requires async media (ENTERPRISE_ASYNC_MEDIA_ENABLED)",
          }
        : {}),
    };
  }

  logWebsiteMaterializationDiagnostic({
    executionId: input.executionId,
    phase: "attempt",
    path: input.path,
    executionKind: input.executionKind,
    executionSpecSupplied: diagContext.executionSpecSupplied,
    asyncMediaPresent: true,
    structuredDataPresent: diagContext.structuredDataPresent,
    websiteRoutesCount: diagContext.websiteRoutesCount,
    providerDeclaredStack: diagContext.providerDeclaredStack,
    metadataPreferredStack: diagContext.metadataPreferredStack,
    materializationAttempted: true,
    briefObjectiveSource: briefResolution.source,
    brandNameSource: brandResolution.source,
    routeIdentifiers: routeIdentifiers(
      recoverWebsiteRoutesPlan(structuredData, recoverOptsFromMetadata(input.metadata)) ??
        [],
    ),
  });

  const exported = await materializeWebsiteExport({
    asyncMedia: input.asyncMedia,
    executionId: input.executionId,
    organizationId: input.organizationId,
    runtimeOutput: input.runtimeOutput,
    jobSummary: input.jobSummary,
    metadata: input.metadata,
    createId: input.createId,
    visualImageDeps: input.visualImageDeps,
  });

  if (!exported.ok) {
    const errorCode =
      exported.error instanceof ValidationError
        ? websiteMaterializationErrorCode(exported.error)
        : WEBSITE_MATERIALIZATION_FAILURE_ERROR;
    const details = exported.error instanceof ValidationError
      ? (exported.error.details as {
          websiteRelevance?: WebsiteRelevanceResult;
          briefObjectiveSource?: string;
          brandNameSource?: string;
          routeIdentifiers?: string;
        })
      : undefined;
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "failed",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: true,
      structuredDataPresent: diagContext.structuredDataPresent,
      websiteRoutesCount: diagContext.websiteRoutesCount,
      providerDeclaredStack: diagContext.providerDeclaredStack,
      metadataPreferredStack: diagContext.metadataPreferredStack,
      materializationAttempted: true,
      exported: false,
      errorCode,
      briefObjectiveSource:
        details?.briefObjectiveSource ?? briefResolution.source,
      brandNameSource: details?.brandNameSource ?? brandResolution.source,
      routeIdentifiers: details?.routeIdentifiers,
      relevanceOk: details?.websiteRelevance?.ok,
      relevanceReasons: details?.websiteRelevance
        ? websiteRelevanceDiagnosticSummary(details.websiteRelevance)
        : undefined,
    });
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
      errorCode,
    };
  }

  const mergedArtifacts = [
    ...(input.currentArtifactIds ?? []),
    ...exported.value.artifactIds,
  ];

  if (mergedArtifacts.length === 0) {
    logWebsiteMaterializationDiagnostic({
      executionId: input.executionId,
      phase: "failed",
      path: input.path,
      executionKind: input.executionKind,
      executionSpecSupplied: diagContext.executionSpecSupplied,
      asyncMediaPresent: true,
      materializationAttempted: true,
      exported: false,
      errorCode: WEBSITE_MATERIALIZATION_FAILURE_ERROR,
    });
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
      errorCode: WEBSITE_MATERIALIZATION_FAILURE_ERROR,
    };
  }

  logWebsiteMaterializationDiagnostic({
    executionId: input.executionId,
    phase: "succeeded",
    path: input.path,
    executionKind: input.executionKind,
    executionSpecSupplied: diagContext.executionSpecSupplied,
    asyncMediaPresent: true,
    structuredDataPresent: diagContext.structuredDataPresent,
    websiteRoutesCount: diagContext.websiteRoutesCount,
    providerDeclaredStack: diagContext.providerDeclaredStack,
    metadataPreferredStack: diagContext.metadataPreferredStack,
    materializationAttempted: true,
    exported: true,
    artifactIds: mergedArtifacts,
  });

  return {
    result: {
      kind: "structured",
      data: exported.value.plan,
    },
    artifactIds: mergedArtifacts,
    exported: true,
  };
}
