/**
 * Build presentation-safe ExecutionResultPayload from job summary / runtime output.
 * M10.5 — never expose vendor bodies, credentials, or signed URLs.
 */

import type {
  ExecutionApiStatus,
  ExecutionResultPayload,
} from "../contracts";
import { recoverWebProjectPlan, webProjectToLegacyPage } from "../../os/delivery/website-generation";

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

  const websiteProject =
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
