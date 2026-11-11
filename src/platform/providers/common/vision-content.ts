/**
 * Canonical vision/image input → vendor wire content helpers.
 */

import type { ProviderAdapterRequest } from "../adapters/contracts/adapter-io";
import { logDroppedReference, screenReferenceImage } from "./reference-image-guard";

export function extractVisionImageRefs(
  request: ProviderAdapterRequest
): readonly { url?: string; storageRef?: string; mimeType?: string; base64?: string }[] {
  const refs: Array<{ url?: string; storageRef?: string; mimeType?: string; base64?: string }> =
    [];

  const consider = (rec: Record<string, unknown>) => {
    const url = typeof rec.url === "string" ? rec.url : undefined;
    const storageRef = typeof rec.storageRef === "string" ? rec.storageRef : undefined;
    const base64 = typeof rec.base64 === "string" ? rec.base64 : undefined;
    const declared = typeof rec.mimeType === "string" ? rec.mimeType : undefined;
    if (!url && !base64) {
      // storageRef-only: trust only a declared image type.
      if (storageRef && (!declared || declared.toLowerCase().startsWith("image/"))) {
        refs.push({ storageRef, mimeType: declared ?? "image/png" });
      } else if (storageRef) {
        logDroppedReference({ where: "extractVisionImageRefs", reason: "not_an_image", detectedMimeType: declared });
      }
      return;
    }
    // Vision models accept images only — a PDF/Word/ZIP fails with HTTP 400.
    const screened = screenReferenceImage({ mimeType: declared, url, base64 });
    if (!screened.ok) {
      logDroppedReference({
        where: "extractVisionImageRefs",
        reason: screened.reason,
        detectedMimeType: screened.detectedMimeType,
        assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
      });
      return;
    }
    const isDataUrl = Boolean(url?.startsWith("data:"));
    refs.push({
      url: isDataUrl && screened.base64
        ? `data:${screened.mimeType};base64,${screened.base64}`
        : url,
      storageRef,
      mimeType: screened.mimeType,
      base64,
    });
  };

  const assets = request.input.assets;
  if (Array.isArray(assets)) {
    for (const a of assets) {
      if (a && typeof a === "object") consider(a as Record<string, unknown>);
    }
  }

  const image = request.input.image;
  if (image && typeof image === "object") {
    consider(image as Record<string, unknown>);
  }

  return refs;
}

export function mapToOpenAIVisionContentParts(
  request: ProviderAdapterRequest
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  const prompt =
    typeof request.input.prompt === "string"
      ? request.input.prompt
      : typeof request.input.text === "string"
        ? request.input.text
        : "Describe this image.";

  parts.push({ type: "text", text: prompt });

  for (const ref of extractVisionImageRefs(request)) {
    if (ref.url) {
      parts.push({ type: "image_url", image_url: { url: ref.url } });
    } else if (ref.base64) {
      const mime = ref.mimeType ?? "image/png";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${ref.base64}` },
      });
    } else if (ref.storageRef) {
      parts.push({
        type: "image_url",
        image_url: { url: `asset://${ref.storageRef}` },
      });
    }
  }

  return parts;
}

export function mapToAnthropicVisionContent(
  request: ProviderAdapterRequest
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const prompt =
    typeof request.input.prompt === "string"
      ? request.input.prompt
      : typeof request.input.text === "string"
        ? request.input.text
        : "Describe this image.";
  blocks.push({ type: "text", text: prompt });

  for (const ref of extractVisionImageRefs(request)) {
    if (ref.base64) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: ref.mimeType ?? "image/png",
          data: ref.base64,
        },
      });
    } else if (ref.url) {
      blocks.push({
        type: "image",
        source: { type: "url", url: ref.url },
      });
    }
  }

  return blocks;
}

export function mapToGeminiVisionParts(
  request: ProviderAdapterRequest
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  const prompt =
    typeof request.input.prompt === "string"
      ? request.input.prompt
      : typeof request.input.text === "string"
        ? request.input.text
        : "Describe this image.";
  parts.push({ text: prompt });

  for (const ref of extractVisionImageRefs(request)) {
    if (ref.base64) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType ?? "image/png",
          data: ref.base64,
        },
      });
    } else if (ref.url) {
      parts.push({ text: `[image:url:${ref.url}]` });
    }
  }

  return parts;
}
