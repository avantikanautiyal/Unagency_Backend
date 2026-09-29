/**
 * Phase 9A — Extract already-resolved multimodal delivery from CanonicalModelRequest.
 * Provider mappers use this as the semantic source when CMR is present.
 * Does NOT query storage, conversation DB, or ProductAsset repository.
 */

import type { CanonicalModelRequest } from "./types";

export const CANONICAL_MULTIMODAL_MAPPING_SOURCE =
  "cmr_multimodal_context" as const;

export type CanonicalMultimodalImageDelivery = {
  readonly itemId: string;
  readonly assetId?: string;
  readonly attachmentId?: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly url?: string;
  readonly storageRef?: string;
  readonly mappingSource: typeof CANONICAL_MULTIMODAL_MAPPING_SOURCE;
};

export type CanonicalMultimodalProviderHandoff = {
  readonly applied: boolean;
  readonly mappingSource: typeof CANONICAL_MULTIMODAL_MAPPING_SOURCE;
  readonly itemCount: number;
  readonly imageDeliveries: readonly CanonicalMultimodalImageDelivery[];
  readonly mappedCount: number;
  readonly omitted: readonly {
    readonly itemId: string;
    readonly reason: string;
    readonly mimeType: string;
    readonly modality: string;
  }[];
};

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/**
 * Read multimodal_context identity from CMR messages and join already-resolved
 * delivery from `multimodalProviderDeliveries` (preferred) or redacted item flags.
 * Extracted-text documents are represented in the flattened prompt; images need
 * provider-native parts built from the delivery bag.
 */
export function extractCanonicalMultimodalProviderHandoff(
  request: CanonicalModelRequest,
  options?: {
    readonly supportsImageInput?: boolean;
  },
): CanonicalMultimodalProviderHandoff {
  const supportsImage = options?.supportsImageInput !== false;
  const omitted: Array<{
    itemId: string;
    reason: string;
    mimeType: string;
    modality: string;
  }> = [];
  const imageDeliveries: CanonicalMultimodalImageDelivery[] = [];
  let itemCount = 0;
  let found = false;

  const deliveryByItemId = new Map(
    (request.multimodalProviderDeliveries ?? []).map((d) => [d.itemId, d]),
  );

  for (const message of request.messages) {
    for (const part of message.content) {
      if (part.type !== "structured" || part.name !== "multimodal_context") {
        continue;
      }
      found = true;
      const data = asRecord(part.data);
      const items = Array.isArray(data?.items) ? data!.items : [];
      for (const raw of items) {
        const item = asRecord(raw);
        if (!item) continue;
        itemCount += 1;
        const itemId =
          typeof item.itemId === "string" ? item.itemId : `item_${itemCount}`;
        const mimeType =
          typeof item.mimeType === "string"
            ? item.mimeType
            : "application/octet-stream";
        const modality =
          typeof item.modality === "string" ? item.modality : "unknown";
        const bag = deliveryByItemId.get(itemId);
        const inline = asRecord(item.providerDelivery);
        const url =
          typeof bag?.url === "string"
            ? bag.url
            : typeof inline?.url === "string"
              ? inline.url
              : undefined;
        const storageRef =
          typeof bag?.storageRef === "string"
            ? bag.storageRef
            : typeof inline?.storageRef === "string"
              ? inline.storageRef
              : undefined;

        if (modality === "image") {
          if (!supportsImage) {
            omitted.push({
              itemId,
              reason: "provider_lacks_image_input",
              mimeType,
              modality,
            });
            continue;
          }
          if (!url && !storageRef) {
            omitted.push({
              itemId,
              reason: "canonical_image_delivery_unavailable",
              mimeType,
              modality,
            });
            continue;
          }
          imageDeliveries.push({
            itemId,
            assetId:
              typeof bag?.assetId === "string"
                ? bag.assetId
                : typeof item.assetId === "string"
                  ? item.assetId
                  : undefined,
            attachmentId:
              typeof bag?.attachmentId === "string"
                ? bag.attachmentId
                : typeof item.attachmentId === "string"
                  ? item.attachmentId
                  : undefined,
            mimeType:
              typeof bag?.mimeType === "string"
                ? bag.mimeType
                : typeof inline?.mimeType === "string"
                  ? inline.mimeType
                  : mimeType,
            filename:
              typeof bag?.filename === "string"
                ? bag.filename
                : typeof item.filename === "string"
                  ? item.filename
                  : undefined,
            url,
            storageRef,
            mappingSource: CANONICAL_MULTIMODAL_MAPPING_SOURCE,
          });
          continue;
        }

        if (modality === "spreadsheet") {
          omitted.push({
            itemId,
            reason: "spreadsheet_provider_native_unsupported",
            mimeType,
            modality,
          });
        }
        // Documents: extracted text already in labeled prompt — not omitted silently.
      }
    }
  }

  return {
    applied: found,
    mappingSource: CANONICAL_MULTIMODAL_MAPPING_SOURCE,
    itemCount,
    imageDeliveries,
    mappedCount: imageDeliveries.length,
    omitted,
  };
}

/** Map canonical image deliveries → OpenAI-style content parts (provider boundary only). */
export function canonicalImageDeliveriesToOpenAIContentParts(
  deliveries: readonly CanonicalMultimodalImageDelivery[],
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const d of deliveries) {
    if (d.url) {
      parts.push({ type: "image_url", image_url: { url: d.url } });
    } else if (d.storageRef) {
      parts.push({
        type: "image_url",
        image_url: { url: `asset://${d.storageRef}` },
      });
    }
  }
  return parts;
}

/** Map canonical image deliveries → Anthropic image blocks (provider boundary only). */
export function canonicalImageDeliveriesToAnthropicBlocks(
  deliveries: readonly CanonicalMultimodalImageDelivery[],
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  for (const d of deliveries) {
    if (d.url?.startsWith("data:") && d.url.includes(";base64,")) {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(d.url);
      if (match) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] || d.mimeType || "image/png",
            data: match[2],
          },
        });
        continue;
      }
    }
    if (d.url) {
      blocks.push({
        type: "image",
        source: { type: "url", url: d.url },
      });
    }
  }
  return blocks;
}
