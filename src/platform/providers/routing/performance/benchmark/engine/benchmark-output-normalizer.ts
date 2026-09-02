/**
 * Normalize provider execution response → benchmark validation input.
 */

import type { ProviderExecutionResponse } from "../../../../runtime/contracts/provider-execution-response";
import type { BenchmarkCase } from "../contracts/benchmark-case";

export type NormalizedBenchmarkOutput = {
  readonly preview: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly providerRequestId?: string;
};

function extractText(output: Readonly<Record<string, unknown>>): string {
  if (output.structured != null && typeof output.structured === "object") {
    return JSON.stringify(output.structured);
  }
  if (typeof output.content === "string" && output.content.trim()) {
    return output.content;
  }
  if (typeof output.text === "string" && output.text.trim()) {
    return output.text;
  }
  if (typeof output.message === "string" && output.message.trim()) {
    return output.message;
  }
  if (output.content != null) {
    try {
      return JSON.stringify(output.content);
    } catch {
      return String(output.content);
    }
  }
  return "";
}

function extractMediaRefs(output: Readonly<Record<string, unknown>>): string[] {
  const ids: string[] = [];

  const artifactIds = output.artifactIds;
  if (Array.isArray(artifactIds)) {
    for (const id of artifactIds) {
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }

  const mediaArtifactIds = output.mediaArtifactIds;
  if (Array.isArray(mediaArtifactIds)) {
    for (const id of mediaArtifactIds) {
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }

  if (typeof output.artifactId === "string" && output.artifactId.trim()) {
    ids.push(output.artifactId.trim());
  }

  const outputs = output.outputs;
  if (Array.isArray(outputs) && outputs.length > 0) {
    const kind = benchmarkCaseOutputKindHint(output);
    if (!extractText(output)) {
      return ids.length > 0 ? ids : [`bench_media_${outputs.length}`];
    }
  }

  return ids;
}

function benchmarkCaseOutputKindHint(output: Readonly<Record<string, unknown>>): string {
  const outputs = output.outputs;
  if (Array.isArray(outputs) && outputs.length > 0) {
    const first = outputs[0] as Record<string, unknown> | undefined;
    if (first?.type === "image") return "image";
    if (first?.type === "video") return "video";
  }
  return "text";
}

export function normalizeProviderResponseForBenchmark(
  response: ProviderExecutionResponse,
  benchmarkCase: BenchmarkCase,
): NormalizedBenchmarkOutput {
  const output = response.output ?? {};
  let preview = extractText(output);

  const mediaArtifactIds = extractMediaRefs(output);
  const kind = benchmarkCase.outputKind.toLowerCase();

  if (!preview && mediaArtifactIds.length > 0) {
    preview =
      kind.includes("image") || kind.includes("mockup")
        ? `Generated image for ${benchmarkCase.service}/${benchmarkCase.subtype}`
        : kind.includes("video")
          ? `Generated video for ${benchmarkCase.service}/${benchmarkCase.subtype}`
          : `Generated media artifact for ${benchmarkCase.service}/${benchmarkCase.subtype}`;
  }

  if (!preview && Array.isArray(output.outputs) && output.outputs.length > 0) {
    preview = `[${output.outputs.length} media output(s)]`;
  }

  let structuredData: unknown;
  if (output.structured != null) {
    structuredData = output.structured;
  } else if (
    kind === "document" ||
    kind === "presentation" ||
    kind === "deferred_website"
  ) {
    const text = extractText(output);
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        structuredData = JSON.parse(text);
      } catch {
        structuredData = undefined;
      }
    }
  }

  return Object.freeze({
    preview: preview || `[empty output: ${benchmarkCase.benchmarkId}]`,
    structuredData,
    mediaArtifactIds: mediaArtifactIds.length > 0 ? Object.freeze(mediaArtifactIds) : undefined,
    providerRequestId: response.providerRequestId,
  });
}
