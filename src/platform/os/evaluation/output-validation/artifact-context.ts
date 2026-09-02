/**
 * Normalized artifact context for validation — actual output is source of truth.
 */

import type { ServiceOutputKind } from "../../../config/service-output-map";
import type { EffectiveOutputContract } from "../../contracts/output-contracts/types";
import type { ArtifactEvaluationBundle } from "../artifact-evaluation/types";

export type ValidationArtifactRef = {
  readonly artifactId: string;
  readonly kind: string;
  readonly mimeType?: string;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly byteSize?: number;
};

export type ValidationArtifactContext = {
  readonly preview: string;
  readonly structuredData?: unknown;
  readonly structuredDataParsed?: Record<string, unknown> | readonly unknown[];
  readonly mediaArtifactIds: readonly string[];
  readonly artifactRefs: readonly ValidationArtifactRef[];
  readonly outputKind?: ServiceOutputKind | string;
  readonly mockupRole?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly actualModality?: string;
  readonly supportedDownloadFormats: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  /** Step 6 — automated artifact evaluation evidence consumed by validators. */
  readonly artifactEvaluation?: ArtifactEvaluationBundle;
};

export function parseStructuredFromPreview(preview: string): unknown | undefined {
  const trimmed = preview.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export function buildArtifactContext(input: {
  readonly preview: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly artifactRefs?: readonly ValidationArtifactRef[];
  readonly outputKind?: string;
  readonly mockupRole?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly actualModality?: string;
  readonly supportedDownloadFormats?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly artifactEvaluation?: ArtifactEvaluationBundle;
}): ValidationArtifactContext {
  const structured =
    input.structuredData ?? parseStructuredFromPreview(input.preview);
  let structuredDataParsed: Record<string, unknown> | readonly unknown[] | undefined;
  if (structured && typeof structured === "object") {
    structuredDataParsed = structured as Record<string, unknown> | readonly unknown[];
  }
  return Object.freeze({
    preview: input.preview ?? "",
    structuredData: structured,
    structuredDataParsed,
    mediaArtifactIds: Object.freeze(input.mediaArtifactIds ?? []),
    artifactRefs: Object.freeze(input.artifactRefs ?? []),
    outputKind: input.outputKind,
    mockupRole: input.mockupRole,
    expectedAspectRatio: input.expectedAspectRatio,
    actualAspectRatio: input.actualAspectRatio,
    actualModality: input.actualModality,
    supportedDownloadFormats: Object.freeze(input.supportedDownloadFormats ?? []),
    buildSucceeded: input.buildSucceeded,
    buildOutput: input.buildOutput,
    runtimeErrors: input.runtimeErrors
      ? Object.freeze([...input.runtimeErrors])
      : undefined,
    artifactEvaluation: input.artifactEvaluation,
  });
}

export function contractFormats(contract: EffectiveOutputContract): readonly string[] {
  return contract.deliverables.supportedFormats.map(String);
}

export function hasMediaArtifact(ctx: ValidationArtifactContext): boolean {
  return (
    ctx.mediaArtifactIds.length > 0 ||
    ctx.artifactRefs.some(
      (a) =>
        a.kind === "media" ||
        a.kind === "image" ||
        a.kind === "video" ||
        (a.mimeType?.startsWith("image/") ?? false) ||
        (a.mimeType?.startsWith("video/") ?? false),
    )
  );
}

export function previewIsEmpty(ctx: ValidationArtifactContext): boolean {
  const p = ctx.preview.trim();
  return !p || p === "[execution output]" || p === "[structured output]";
}

const PLACEHOLDER_RE =
  /\b(lorem ipsum|placeholder text|\[TODO\]|\[FIXME\]|fixme:|todo:|xxx+|sample text only)\b/i;

export function hasPlaceholderContent(ctx: ValidationArtifactContext): boolean {
  return PLACEHOLDER_RE.test(ctx.preview);
}

/** Plain object suitable for string-key lookup — excludes arrays and non-objects. */
function isStringKeyedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function structuredHasKey(
  ctx: ValidationArtifactContext,
  ...keys: string[]
): boolean {
  const obj = ctx.structuredDataParsed;
  if (!isStringKeyedRecord(obj)) {
    return false;
  }
  return keys.some((k) => k in obj && obj[k] != null);
}

export function structuredArrayLength(
  ctx: ValidationArtifactContext,
  key: string,
): number | undefined {
  const obj = ctx.structuredDataParsed;
  if (!isStringKeyedRecord(obj)) {
    return undefined;
  }
  const val = obj[key];
  return Array.isArray(val) ? val.length : undefined;
}
