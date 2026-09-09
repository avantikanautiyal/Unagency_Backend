/**
 * Build presentation-safe ExecutionResultPayload from job summary / runtime output.
 * M10.5 — never expose vendor bodies, credentials, or signed URLs.
 */

import type {
  ExecutionApiStatus,
  ExecutionResultPayload,
} from "../contracts";
import { recoverWebProjectPlan, recoverWebsiteRoutesPlan, webProjectToLegacyPage } from "../../os/delivery/website-generation";

const MAX_TEXT = 8_000;

export function buildExecutionResultPayload(input: {
  readonly status: ExecutionApiStatus;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
}): ExecutionResultPayload {
  const { status, jobSummary, runtimeOutput } = input;

  if (status === "awaiting_approval") {
    return { kind: "tool_approval_required" };
  }

  if (
    status === "queued" ||
    status === "running" ||
    status === "waiting_provider" ||
    status === "processing_result" ||
    status === "streaming" ||
    status === "retrying"
  ) {
    return { kind: "pending" };
  }

  const structured =
    jobSummary?.structuredData ??
    runtimeOutput?.structured ??
    runtimeOutput?.structuredOutput ??
    (runtimeOutput?.data != null && typeof runtimeOutput.data === "object"
      ? runtimeOutput.data
      : undefined);

  const websiteRoutes = recoverWebsiteRoutesPlan(structured);
  const websiteProject =
    websiteRoutes?.[0] ??
    recoverWebProjectPlan(structured) ??
    recoverWebProjectPlan(
      typeof jobSummary?.resultText === "string" ? jobSummary.resultText : undefined
    ) ??
    recoverWebProjectPlan(pickText(runtimeOutput));

  // Only promote to website when recovery found a real project — LaunchPlan
  // {title,summary,steps} must stay as structured creative routes.
  if (websiteProject && !looksLikeLaunchPlan(structured)) {
    const extra =
      structured && typeof structured === "object"
        ? (structured as Record<string, unknown>)
        : {};
    const legacy = webProjectToLegacyPage(websiteProject);
    const materializedRoutes =
      websiteRoutes && websiteRoutes.length > 1
        ? websiteRoutes.map((route) => {
            const routeLegacy = webProjectToLegacyPage(route);
            return {
              ...route,
              techStack: route.stack,
              html: routeLegacy.html,
              exportKind: "website" as const,
            };
          })
        : undefined;
    return {
      kind: "structured",
      data: {
        ...websiteProject,
        techStack: websiteProject.stack,
        html: legacy.html,
        ...(typeof extra.exportKind === "string"
          ? { exportKind: extra.exportKind }
          : { exportKind: "website" }),
        ...(typeof extra.htmlArtifactId === "string"
          ? { htmlArtifactId: extra.htmlArtifactId }
          : {}),
        ...(typeof extra.projectArtifactId === "string"
          ? { projectArtifactId: extra.projectArtifactId }
          : {}),
        ...(materializedRoutes ? { routes: materializedRoutes } : {}),
        ...(runtimeOutput?.presentationMeta != null
          ? { presentationMeta: runtimeOutput.presentationMeta }
          : {}),
      },
    };
  }

  if (structured != null) {
    const data =
      runtimeOutput?.presentationMeta != null &&
      typeof structured === "object" &&
      structured !== null &&
      !("presentationMeta" in (structured as Record<string, unknown>))
        ? {
            ...(structured as Record<string, unknown>),
            presentationMeta: runtimeOutput.presentationMeta,
          }
        : structured;
    return { kind: "structured", data };
  }

  const fromSummary =
    typeof jobSummary?.resultText === "string" ? jobSummary.resultText : undefined;
  const fromRuntime = pickText(runtimeOutput);
  const text = (fromSummary ?? fromRuntime)?.slice(0, MAX_TEXT);

  if (text?.trim()) {
    return { kind: "text", text };
  }

  return { kind: "empty" };
}

/**
 * When worker-side export attaches PDF/PPTX/DOCX artifacts, keep structured
 * deck/document data on the execution result — never collapse to artifactIds alone.
 */
export function mergeExportArtifactsIntoResult(input: {
  readonly status: ExecutionApiStatus;
  readonly result: ExecutionResultPayload;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly mediaArtifactIds: readonly string[];
}): ExecutionResultPayload {
  if (input.status !== "succeeded" || input.mediaArtifactIds.length === 0) {
    return input.result;
  }

  const exportKind =
    typeof input.jobSummary?.documentExportKind === "string"
      ? input.jobSummary.documentExportKind
      : undefined;
  const plan =
    input.jobSummary?.structuredData != null &&
    typeof input.jobSummary.structuredData === "object"
      ? (input.jobSummary.structuredData as Record<string, unknown>)
      : null;

  if (exportKind && plan) {
    return {
      kind: "structured",
      data: {
        ...plan,
        exportKind,
        downloadFormats:
          exportKind === "document"
            ? ["pdf", "docx"]
            : exportKind === "email"
              ? ["html"]
              : ["pdf", "pptx"],
        artifactIds: [...input.mediaArtifactIds],
      },
    };
  }

  const websiteStamped = stampWebsiteExportPreview({
    result: input.result,
    mediaArtifactIds: input.mediaArtifactIds,
    jobSummary: input.jobSummary,
  });
  if (websiteStamped) return websiteStamped;

  if (input.result.kind === "structured" && input.result.data != null) {
    const base =
      typeof input.result.data === "object" && !Array.isArray(input.result.data)
        ? (input.result.data as Record<string, unknown>)
        : {};
    return {
      kind: "structured",
      data: {
        ...base,
        artifactIds: [...input.mediaArtifactIds],
      },
    };
  }

  return {
    kind: "artifact",
    data: { artifactIds: [...input.mediaArtifactIds] },
  };
}

function looksLikeWebsiteExportArtifacts(ids: readonly string[]): boolean {
  return ids.some((id) => /webexport/i.test(id));
}

function pairWebsiteExportArtifacts(
  ids: readonly string[],
): { projectArtifactId: string; htmlArtifactId?: string }[] {
  const pairs: { projectArtifactId: string; htmlArtifactId?: string }[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const projectArtifactId = ids[i];
    if (!projectArtifactId) continue;
    const htmlArtifactId = ids[i + 1];
    pairs.push({
      projectArtifactId,
      ...(htmlArtifactId ? { htmlArtifactId } : {}),
    });
  }
  return pairs;
}

/**
 * Zip/HTML pairs from the website materializer are enough for the client preview
 * even when job summary HTML was too large to round-trip through poll hydrate.
 */
export function stampWebsiteExportPreview(input: {
  readonly result: ExecutionResultPayload;
  readonly mediaArtifactIds: readonly string[];
  readonly jobSummary?: Readonly<Record<string, unknown>>;
}): ExecutionResultPayload | undefined {
  const ids = input.mediaArtifactIds.filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  if (ids.length === 0) return undefined;

  const structured = input.jobSummary?.structuredData;
  const routes = recoverWebsiteRoutesPlan(structured);
  const structuredRecord =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : undefined;
  const looksWebsite =
    looksLikeWebsiteExportArtifacts(ids) ||
    structuredRecord?.exportKind === "website" ||
    Boolean(routes?.length);

  if (!looksWebsite) return undefined;

  const pairs = pairWebsiteExportArtifacts(ids);
  const existing =
    input.result.kind === "structured" &&
    input.result.data &&
    typeof input.result.data === "object" &&
    !Array.isArray(input.result.data)
      ? (input.result.data as Record<string, unknown>)
      : {};
  const fromStructured = structuredRecord ?? {};
  const htmlArtifactId =
    (typeof existing.htmlArtifactId === "string" && existing.htmlArtifactId.trim()) ||
    (typeof fromStructured.htmlArtifactId === "string" &&
      fromStructured.htmlArtifactId.trim()) ||
    pairs[0]?.htmlArtifactId;
  const projectArtifactId =
    (typeof existing.projectArtifactId === "string" &&
      existing.projectArtifactId.trim()) ||
    (typeof fromStructured.projectArtifactId === "string" &&
      fromStructured.projectArtifactId.trim()) ||
    pairs[0]?.projectArtifactId;

  const existingRoutes = Array.isArray(existing.routes)
    ? (existing.routes as Record<string, unknown>[])
    : Array.isArray(fromStructured.routes)
      ? (fromStructured.routes as Record<string, unknown>[])
      : [];
  const stampedRoutes =
    existingRoutes.length > 0
      ? existingRoutes.map((route, i) => ({
          ...route,
          ...(pairs[i]?.projectArtifactId
            ? { projectArtifactId: pairs[i]!.projectArtifactId }
            : {}),
          ...(pairs[i]?.htmlArtifactId
            ? { htmlArtifactId: pairs[i]!.htmlArtifactId }
            : {}),
        }))
      : pairs.map((pair, i) => ({
          title: `Route ${i + 1}`,
          exportKind: "website",
          projectArtifactId: pair.projectArtifactId,
          ...(pair.htmlArtifactId ? { htmlArtifactId: pair.htmlArtifactId } : {}),
        }));

  return {
    kind: "structured",
    data: {
      ...fromStructured,
      ...existing,
      exportKind: "website",
      ...(htmlArtifactId ? { htmlArtifactId } : {}),
      ...(projectArtifactId ? { projectArtifactId } : {}),
      artifactIds: ids,
      ...(stampedRoutes.length > 0 ? { routes: stampedRoutes } : {}),
    },
  };
}

/** LaunchPlan / creative routes — must not be rewritten as a website. */
function looksLikeLaunchPlan(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.steps) || d.steps.length === 0) return false;
  if (Array.isArray(d.files) && d.files.length > 0) return false;
  if (typeof d.html === "string" && d.html.trim()) return false;
  if (typeof d.stack === "string" && d.stack.trim()) return false;
  return true;
}

function pickText(
  output: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  if (!output) return undefined;
  for (const key of ["content", "text", "message"] as const) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}
