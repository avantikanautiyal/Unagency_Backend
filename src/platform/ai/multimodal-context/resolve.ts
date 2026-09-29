/**
 * Deterministic multimodal context assembly from authorized descriptors.
 * No storage I/O. No provider payloads. No invented attachments.
 */

import { PRODUCT_ALLOWED_MIME } from "../../media/upload/upload-pipeline";
import {
  DEFAULT_MULTIMODAL_BOUNDS,
  DEFAULT_TEXT_PROVIDER_MULTIMODAL_CAPABILITIES,
  DOCX_MIME,
  MULTIMODAL_SELECTION_METHOD,
  PDF_MIME,
  PPTX_MIME,
  XLSX_MIME,
  type MultimodalContext,
  type MultimodalContextItem,
  type MultimodalDeliveryStatus,
  type MultimodalInputDescriptor,
  type MultimodalModality,
  type MultimodalContextBounds,
  type ProviderMultimodalCapabilities,
} from "./types";

const EXTENDED_KNOWN_MIME = new Set<string>([
  ...PRODUCT_ALLOWED_MIME,
  XLSX_MIME,
  "application/vnd.ms-excel",
]);

export function inferMultimodalModality(mimeType: string): MultimodalModality {
  const m = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m === XLSX_MIME || m === "application/vnd.ms-excel") return "spreadsheet";
  if (
    m === PDF_MIME ||
    m === DOCX_MIME ||
    m === PPTX_MIME ||
    m === "application/msword" ||
    m === "application/vnd.ms-powerpoint" ||
    m === "text/plain" ||
    m === "text/markdown" ||
    m === "text/html"
  ) {
    return "document";
  }
  return "unknown";
}

function boundText(
  text: string | undefined,
  maxChars: number,
): { text?: string; truncated: boolean } {
  if (!text?.trim()) return { truncated: false };
  const t = text.trim();
  if (t.length <= maxChars) return { text: t, truncated: false };
  return { text: t.slice(0, maxChars), truncated: true };
}

function itemKey(d: MultimodalInputDescriptor): string {
  if (d.assetId?.trim()) return `asset:${d.assetId.trim()}`;
  if (d.attachmentId?.trim()) return `att:${d.attachmentId.trim()}`;
  if (d.messageId?.trim() && d.filename?.trim()) {
    return `msg:${d.messageId.trim()}:${d.filename.trim()}`;
  }
  if (d.url?.trim()) {
    // Stable key without logging the URL in traces — hash-like slice.
    const u = d.url.trim();
    return `url:${u.length}:${u.slice(0, 24)}:${u.slice(-12)}`;
  }
  return `anon:${(d.mimeType ?? "unknown").toLowerCase()}:${d.filename ?? ""}`;
}

function deliveryFor(
  modality: MultimodalModality,
  mime: string,
  extracted: string | undefined,
  hasVisual: boolean,
): MultimodalDeliveryStatus {
  if (modality === "spreadsheet" || mime === XLSX_MIME) {
    return "unsupported_extraction";
  }
  if (!EXTENDED_KNOWN_MIME.has(mime) && modality === "unknown") {
    return "unsupported_mime";
  }
  if (extracted?.trim()) {
    return hasVisual ? "ready" : "extracted_text_only";
  }
  if (hasVisual) return "ready";
  if (modality === "document") {
    return "identity_only";
  }
  if (modality === "image") return hasVisual ? "ready" : "identity_only";
  return "identity_only";
}

export function selectMultimodalContext(input: {
  readonly descriptors: readonly MultimodalInputDescriptor[];
  readonly organizationId?: string;
  readonly bounds?: Partial<MultimodalContextBounds>;
}): MultimodalContext {
  const bounds: MultimodalContextBounds = {
    ...DEFAULT_MULTIMODAL_BOUNDS,
    ...input.bounds,
  };
  const seen = new Set<string>();
  const items: MultimodalContextItem[] = [];
  let skippedCount = 0;
  let truncated = false;
  let extractedBudget = bounds.maxExtractedTextChars;

  for (const d of input.descriptors) {
    if (items.length >= bounds.maxItems) {
      skippedCount += 1;
      truncated = true;
      continue;
    }

    const mime = (d.mimeType ?? "application/octet-stream")
      .toLowerCase()
      .split(";")[0]
      ?.trim() || "application/octet-stream";

    // Authorization: if org stamped on descriptor, must match execution org.
    if (
      input.organizationId &&
      d.organizationId &&
      d.organizationId !== input.organizationId
    ) {
      skippedCount += 1;
      items.push({
        itemId: `skip_unauth_${items.length}`,
        sourceType: d.sourceType,
        modality: inferMultimodalModality(mime),
        mimeType: mime,
        filename: d.filename,
        assetId: d.assetId,
        attachmentId: d.attachmentId,
        messageId: d.messageId,
        conversationId: d.conversationId,
        organizationId: d.organizationId,
        provenance: [...(d.provenance ?? []), "authorization_reject"],
        relationshipLabel: d.relationshipLabel,
        accessKind: "none",
        hasVisualProviderRef: false,
        deliveryStatus: "unauthorized_skipped",
        sizeBytes: d.sizeBytes,
        notes: ["Cross-organization attachment rejected"],
      });
      continue;
    }

    const key = itemKey(d);
    if (seen.has(key)) {
      skippedCount += 1;
      continue;
    }
    seen.add(key);

    const modality = inferMultimodalModality(mime);
    const providerDelivery =
      d.url || d.storageRef
        ? {
            ...(d.url ? { url: d.url } : {}),
            ...(d.storageRef ? { storageRef: d.storageRef } : {}),
            mimeType: mime,
          }
        : undefined;
    const hasVisual =
      Boolean(providerDelivery) ||
      d.hasVisualProviderRef === true;

    const bounded = boundText(
      d.extractedText,
      Math.min(bounds.maxExtractedTextCharsPerItem, extractedBudget),
    );
    if (bounded.truncated) truncated = true;
    if (bounded.text) {
      extractedBudget = Math.max(0, extractedBudget - bounded.text.length);
    }

    const accessKind =
      providerDelivery
        ? d.sourceType === "chat_attachment"
          ? "authorized_message_url"
          : "provider_input_ref"
        : "identity_only";

    const deliveryStatus = deliveryFor(
      modality,
      mime,
      bounded.text,
      Boolean(providerDelivery),
    );

    const notes: string[] = [];
    if (modality === "spreadsheet") {
      notes.push(
        "XLSX binary/provider-native input is not supported; identity preserved explicitly.",
      );
    }
    if (
      (mime === DOCX_MIME || mime === PPTX_MIME) &&
      !bounded.text
    ) {
      notes.push(
        "No extracted text available from existing extraction pipeline for this attachment.",
      );
    }
    if (mime === PDF_MIME && !bounded.text) {
      notes.push(
        "PDF identity preserved; extracted text unavailable (existing extractor optional).",
      );
    }

    items.push({
      itemId: key,
      sourceType: d.sourceType,
      modality,
      mimeType: mime,
      filename: d.filename,
      assetId: d.assetId?.trim() || undefined,
      attachmentId: d.attachmentId?.trim() || undefined,
      messageId: d.messageId,
      conversationId: d.conversationId,
      organizationId: d.organizationId ?? input.organizationId,
      provenance: d.provenance ?? [d.sourceType],
      relationshipLabel: d.relationshipLabel,
      semanticReferenceRole: d.semanticReferenceRole,
      referenceRoleResolutionSource: d.referenceRoleResolutionSource,
      accessKind,
      hasVisualProviderRef: Boolean(providerDelivery),
      providerDelivery,
      extractedText: bounded.text,
      extractedTextChars: bounded.text?.length,
      deliveryStatus,
      sizeBytes: d.sizeBytes,
      notes: notes.length ? notes : undefined,
    });
  }

  const imageCount = items.filter((i) => i.modality === "image").length;
  const documentCount = items.filter((i) => i.modality === "document").length;
  const spreadsheetCount = items.filter(
    (i) => i.modality === "spreadsheet",
  ).length;
  const unsupportedCount = items.filter(
    (i) =>
      i.deliveryStatus === "unsupported_extraction" ||
      i.deliveryStatus === "unsupported_mime" ||
      i.deliveryStatus === "unauthorized_skipped",
  ).length;
  const extractedTextCount = items.filter((i) =>
    Boolean(i.extractedText?.trim()),
  ).length;

  return {
    applied: items.some(
      (i) =>
        i.deliveryStatus !== "unauthorized_skipped" &&
        i.deliveryStatus !== "limit_skipped",
    ),
    items,
    selectionMethod: MULTIMODAL_SELECTION_METHOD,
    bounds,
    imageCount,
    documentCount,
    spreadsheetCount,
    unsupportedCount,
    extractedTextCount,
    skippedCount,
    truncated,
  };
}

export type MultimodalProviderProjection = {
  readonly promptSectionPresent: boolean;
  readonly visualRefs: readonly {
    readonly url?: string;
    readonly storageRef?: string;
    readonly mimeType?: string;
    readonly organizationId?: string;
    readonly assetId?: string;
  }[];
  readonly mappedCount: number;
  readonly omitted: readonly {
    readonly itemId: string;
    readonly reason: string;
    readonly mimeType: string;
    readonly modality: MultimodalModality;
  }[];
};

/**
 * Project canonical multimodal context for a provider capability profile.
 * Does not fetch storage. Visual refs must already be on descriptors/assets.
 */
export function projectMultimodalForProvider(input: {
  readonly context: MultimodalContext;
  readonly visualAssets?: readonly {
    readonly url?: string;
    readonly storageRef?: string;
    readonly mimeType?: string;
    readonly organizationId?: string;
    readonly assetId?: string;
  }[];
  readonly capabilities?: ProviderMultimodalCapabilities;
}): MultimodalProviderProjection {
  const caps =
    input.capabilities ?? DEFAULT_TEXT_PROVIDER_MULTIMODAL_CAPABILITIES;
  const omitted: Array<{
    itemId: string;
    reason: string;
    mimeType: string;
    modality: MultimodalModality;
  }> = [];
  const visualRefs: Array<{
    url?: string;
    storageRef?: string;
    mimeType?: string;
    organizationId?: string;
    assetId?: string;
  }> = [];

  for (const item of input.context.items) {
    if (item.deliveryStatus === "unauthorized_skipped") {
      omitted.push({
        itemId: item.itemId,
        reason: "unauthorized",
        mimeType: item.mimeType,
        modality: item.modality,
      });
      continue;
    }

    if (item.modality === "image") {
      if (!caps.supportsImageInput) {
        omitted.push({
          itemId: item.itemId,
          reason: "provider_lacks_image_input",
          mimeType: item.mimeType,
          modality: item.modality,
        });
        continue;
      }
      const delivery = item.providerDelivery;
      if (delivery && (delivery.url || delivery.storageRef)) {
        visualRefs.push({
          url: delivery.url,
          storageRef: delivery.storageRef,
          mimeType: delivery.mimeType ?? item.mimeType,
          organizationId: item.organizationId,
          assetId: item.assetId,
        });
      } else if (!item.extractedText) {
        omitted.push({
          itemId: item.itemId,
          reason: "image_ref_unavailable_for_provider",
          mimeType: item.mimeType,
          modality: item.modality,
        });
      }
      continue;
    }

    if (item.modality === "spreadsheet") {
      omitted.push({
        itemId: item.itemId,
        reason: "spreadsheet_provider_native_unsupported",
        mimeType: item.mimeType,
        modality: item.modality,
      });
      // Identity + notes remain in CMR flatten — not silent.
      continue;
    }

    if (item.modality === "document") {
      if (item.mimeType === PDF_MIME && caps.supportsPdfNativeInput) {
        // Native PDF not implemented in current providers — fall through.
      }
      if (!item.extractedText && !caps.supportsExtractedTextFallback) {
        omitted.push({
          itemId: item.itemId,
          reason: "document_no_extracted_text",
          mimeType: item.mimeType,
          modality: item.modality,
        });
      }
      // Extracted text is carried via labeled prompt section — not omitted.
    }
  }

  return {
    promptSectionPresent: input.context.applied,
    visualRefs,
    mappedCount: visualRefs.length,
    omitted,
  };
}

export function summarizeMultimodalForTrace(
  ctx: MultimodalContext,
): Record<string, unknown> {
  return {
    multimodalContextApplied: ctx.applied,
    multimodalItemCount: ctx.items.filter(
      (i) => i.deliveryStatus !== "unauthorized_skipped",
    ).length,
    multimodalImageCount: ctx.imageCount,
    multimodalDocumentCount: ctx.documentCount,
    multimodalUnsupportedCount: ctx.unsupportedCount,
    multimodalExtractedTextCount: ctx.extractedTextCount,
    multimodalSelectionMethod: ctx.selectionMethod,
    multimodalTruncated: ctx.truncated,
    multimodalSkippedCount: ctx.skippedCount,
    multimodalMimeTypes: ctx.items.map((i) => i.mimeType),
    multimodalSourceTypes: ctx.items.map((i) => i.sourceType),
    multimodalAssetIds: ctx.items
      .map((i) => i.assetId)
      .filter((id): id is string => Boolean(id)),
    multimodalSemanticReferenceRoles: ctx.items.map(
      (i) => i.semanticReferenceRole ?? null,
    ),
    multimodalReferenceRoleResolutionSources: ctx.items.map(
      (i) => i.referenceRoleResolutionSource ?? null,
    ),
  };
}
