/**
 * Persist sync image.generate outputs (OpenAI GPT Image / Gemini flash-image / etc.)
 * into durable blobs + ExecutionArtifact refs so product getMedia works.
 *
 * LIVE image leaves are sync (not async video). Without this bridge, executions
 * succeed with content "[1 image(s)]" but never produce downloadable media.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  mapOpenAIImageDataToOutputs,
  type CanonicalMediaOutput,
} from "../../intelligence/providers/common/media-output";

function extractBase64FromDataUrl(url: string): string | undefined {
  const marker = ";base64,";
  const idx = url.indexOf(marker);
  if (!url.startsWith("data:") || idx < 0) return undefined;
  const raw = url.slice(idx + marker.length).trim();
  return raw || undefined;
}

function summarizeRuntimeOutput(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined
): string {
  if (!runtimeOutput) return "runtimeOutput=undefined";
  const keys = Object.keys(runtimeOutput).join(",");
  const outputsLen = Array.isArray(runtimeOutput.outputs)
    ? runtimeOutput.outputs.length
    : 0;
  const contentType = Array.isArray(runtimeOutput.content)
    ? `array:${runtimeOutput.content.length}`
    : typeof runtimeOutput.content;
  return `keys=${keys || "none"} | outputsLen=${outputsLen} | contentType=${contentType}`;
}

/**
 * Prefer canonical `outputs[]`; fall back to OpenAI-style `content` / `data` arrays
 * when consensus or older mappers left media only on the raw payload.
 */
export function listImageMediaOutputs(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined
): readonly CanonicalMediaOutput[] {
  if (!runtimeOutput) return [];

  const fromOutputs = Array.isArray(runtimeOutput.outputs)
    ? runtimeOutput.outputs.filter((item): item is CanonicalMediaOutput => {
        if (!item || typeof item !== "object") return false;
        const rec = item as Record<string, unknown>;
        return rec.type === "image";
      })
    : [];
  if (fromOutputs.length > 0) return fromOutputs;

  if (Array.isArray(runtimeOutput.content)) {
    const mapped = mapOpenAIImageDataToOutputs({
      data: runtimeOutput.content as unknown[],
    });
    if (mapped.length > 0) return mapped;
  }

  if (Array.isArray(runtimeOutput.data)) {
    const mapped = mapOpenAIImageDataToOutputs({
      data: runtimeOutput.data as unknown[],
    });
    if (mapped.length > 0) return mapped;
  }

  return [];
}

export async function materializeSyncImageArtifacts(input: {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly executionId: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly runtimeOutput: Readonly<Record<string, unknown>> | undefined;
  readonly createId: (prefix: string) => string;
}): Promise<Result<readonly string[]>> {
  const images = listImageMediaOutputs(input.runtimeOutput);
  if (images.length === 0) {
    return failure(
      new ValidationError(
        `Sync image execution produced no media outputs to materialize (${summarizeRuntimeOutput(input.runtimeOutput)})`
      )
    );
  }

  const operationId = input.createId("syncimg");
  const artifactIds: string[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]!;
    const artifactId = input.asyncMedia.artifacts.buildArtifactId(operationId, index);

    const fromField =
      typeof image.base64 === "string" && image.base64.trim()
        ? image.base64.trim()
        : undefined;
    const fromDataUrl =
      typeof image.url === "string" ? extractBase64FromDataUrl(image.url) : undefined;
    const base64 = fromField ?? fromDataUrl;
    const temporaryUrl =
      !base64 && typeof image.url === "string" && /^https?:\/\//i.test(image.url)
        ? image.url
        : undefined;

    if (!base64 && !temporaryUrl) {
      return failure(
        new ValidationError(
          `Image output ${index} has neither base64 nor https URL for ingestion`
        )
      );
    }

    const ingested = await input.asyncMedia.ingestion.ingest({
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId,
      outputIndex: index,
      temporaryUrl,
      base64,
      mimeType: image.mimeType ?? "image/png",
    });
    if (!ingested.ok) return ingested;

    await input.asyncMedia.artifacts.finalize({
      operationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      outputIndex: index,
      blob: ingested.value,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: input.capabilityId,
    });

    artifactIds.push(artifactId);
  }

  return success(artifactIds);
}
