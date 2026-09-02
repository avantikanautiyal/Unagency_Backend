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
  extractWebsiteBrandName,
  isHtmlStaticPreviewable,
  recoverWebProjectPlan,
  recoverWebsiteRoutesPlan,
  resolveWebsiteBrandColors,
  validateWebsitePageRelevance,
  webProjectToLegacyPage,
  websiteContextFromMetadata,
  type WebProjectPlan,
  type WebsitePagePlan,
  type WebsiteRoutePlan,
  type WebStack,
} from "../../os/delivery/website-generation";

const HTML_MIME = "text/html; charset=utf-8";
const ZIP_MIME = "application/zip";

export type { WebsitePagePlan, WebProjectPlan };

export const normalizeWebsiteHtml = (
  raw: string
): string => recoverWebProjectPlan(raw)?.files[0]?.content ?? raw.trim();

export function parseWebsitePage(data: unknown): WebsitePagePlan | null {
  const project = recoverWebProjectPlan(data);
  if (!project) return null;
  return webProjectToLegacyPage(project);
}

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
  const ctx = websiteContextFromMetadata(metadata, "");
  return {
    preferredStack: ctx.stack,
    brandColors: ctx.brandColors.length
      ? ctx.brandColors
      : resolveWebsiteBrandColors(metadata, ""),
  };
}

function pickStructuredData(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined,
  jobSummary: Readonly<Record<string, unknown>> | undefined
): unknown {
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
    if (candidate != null && parseWebProject(candidate)) return candidate;
  }
  return (
    fromJobStructured ??
    fromRuntimeStructured ??
    fromRuntimeStructuredOutput ??
    fromRuntimeData ??
    fromJobText ??
    fromRuntimeContent ??
    fromRuntimeText
  );
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
  const data = pickStructuredData(input.runtimeOutput, input.jobSummary);
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

  const brief =
    typeof input.metadata?.websiteUserBrief === "string"
      ? input.metadata.websiteUserBrief
      : typeof input.jobSummary?.websiteUserBrief === "string"
        ? input.jobSummary.websiteUserBrief
        : typeof input.runtimeOutput?.websiteUserBrief === "string"
          ? input.runtimeOutput.websiteUserBrief
          : "";
  const brandName =
    extractWebsiteBrandName(brief) ||
    (typeof input.metadata?.requiredBrandName === "string"
      ? input.metadata.requiredBrandName
      : typeof input.metadata?.brandName === "string"
        ? input.metadata.brandName
        : undefined);

  for (const project of routes) {
    const relevance = validateWebsitePageRelevance({
      data: project,
      userBrief: brief,
      brandName,
    });
    if (!relevance.ok && brief.trim() && !recoveredFromRaw) {
      return failure(
        new ValidationError(
          "Website output was not grounded in your brief. Please try again with a clear brand name and requirements.",
          { websiteRelevance: relevance }
        )
      );
    }
  }

  const artifactIds: string[] = [];
  const materialized: MaterializedRoute[] = [];
  let outputOffset = 0;
  for (const project of routes.slice(0, 3)) {
    const one = await materializeOneProject({
      asyncMedia: input.asyncMedia,
      executionId: input.executionId,
      organizationId: input.organizationId,
      createId: input.createId,
      providerId: input.providerId,
      modelId: input.modelId,
      project,
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

function existingWebsiteRoutes(
  result?: ExecutionResultPayload
): unknown[] | undefined {
  const data = result?.data;
  if (!data || typeof data !== "object") return undefined;
  const routes = (data as { routes?: unknown }).routes;
  return Array.isArray(routes) && routes.length > 0 ? routes : undefined;
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
}): Promise<{
  result: ExecutionResultPayload;
  artifactIds?: string[];
  exported: boolean;
  errorCode?: string;
}> {
  const existingHtml = existingHtmlArtifactId(input.currentResult);
  const existingProject = existingProjectArtifactId(input.currentResult);
  const existingRoutes = existingWebsiteRoutes(input.currentResult);
  if (existingHtml || existingProject || existingRoutes) {
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      artifactIds: input.currentArtifactIds
        ? [...input.currentArtifactIds]
        : undefined,
      exported: true,
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
    data: pickStructuredData(input.runtimeOutput, input.jobSummary),
  });

  if (!shouldExport) {
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

  const exported = await materializeWebsiteExport({
    asyncMedia: input.asyncMedia,
    executionId: input.executionId,
    organizationId: input.organizationId,
    runtimeOutput: input.runtimeOutput,
    jobSummary: input.jobSummary,
    metadata: input.metadata,
    createId: input.createId,
  });

  if (!exported.ok) {
    return {
      result: input.currentResult ?? { kind: "structured", data: {} },
      exported: false,
      errorCode: String(exported.error.message ?? "export_failed"),
    };
  }

  const mergedArtifacts = [
    ...(input.currentArtifactIds ?? []),
    ...exported.value.artifactIds,
  ];

  return {
    result: {
      kind: "structured",
      data: exported.value.plan,
    },
    artifactIds: mergedArtifacts,
    exported: true,
  };
}
