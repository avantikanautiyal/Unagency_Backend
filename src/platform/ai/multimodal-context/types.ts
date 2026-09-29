/**
 * Phase 9 — Canonical Multimodal Context (provider-neutral).
 *
 * Representation of user/application-provided multimedia context.
 * NOT a replacement for ArtifactVersion context.
 * Does NOT embed provider-specific payloads (OpenAI image_url, etc.).
 * Does NOT store binary bodies — references + optional extracted text only.
 */

import type {
  MultimodalReferenceRole,
  ReferenceRoleResolutionSource,
} from "./reference-role";

export type {
  MultimodalReferenceRole,
  ReferenceRoleResolutionSource,
  ResolvedCanonicalReferenceRole,
  ImageReferenceAdaptationPlan,
  ProviderReferenceRoleObservability,
} from "./reference-role";
export {
  MULTIMODAL_REFERENCE_ROLES,
  isMultimodalReferenceRole,
  resolveMultimodalReferenceRole,
  resolveCanonicalReferenceRoleWithSource,
  roleAllowsStyleReferenceChannel,
  promptGuidanceForReferenceRole,
  planImageReferenceAdaptation,
  buildProviderReferenceRoleObservability,
} from "./reference-role";

export const MULTIMODAL_SELECTION_METHOD =
  "authorized_metadata_and_conversation_attachments" as const;

export type MultimodalSourceType =
  | "product_asset"
  | "chat_attachment"
  | "execution_metadata"
  | "message_attachment"
  | "explicit_descriptor";

export type MultimodalModality =
  | "image"
  | "document"
  | "spreadsheet"
  | "audio"
  | "video"
  | "unknown";

export type MultimodalDeliveryStatus =
  | "ready"
  | "identity_only"
  | "extracted_text_only"
  | "unsupported_extraction"
  | "unsupported_mime"
  | "unauthorized_skipped"
  | "limit_skipped"
  | "duplicate_skipped";

export type MultimodalAccessKind =
  | "provider_input_ref"
  | "authorized_message_url"
  | "identity_only"
  | "none";

/**
 * Provider-neutral, already-resolved delivery handle for an image/visual item.
 * Not an OpenAI/Anthropic/Gemini wire shape — mappers convert this at the boundary.
 * Must not be logged (may contain data URLs or signed URLs).
 */
export type MultimodalProviderDelivery = {
  readonly url?: string;
  readonly storageRef?: string;
  readonly mimeType?: string;
};

/**
 * Provider-neutral multimodal item. No OpenAI/Anthropic/Gemini wire shapes.
 * Visual bytes live in existing storage; when already resolved, `providerDelivery`
 * carries the controlled reference for provider mappers (CMR semantic source).
 */
export type MultimodalContextItem = {
  readonly itemId: string;
  readonly sourceType: MultimodalSourceType;
  readonly modality: MultimodalModality;
  readonly mimeType: string;
  readonly filename?: string;
  readonly assetId?: string;
  readonly attachmentId?: string;
  readonly messageId?: string;
  readonly conversationId?: string;
  readonly organizationId?: string;
  readonly provenance: readonly string[];
  readonly relationshipLabel?: string;
  /**
   * Why this item is attached (identity mark vs style vs product, …).
   * Independent of filename, MIME type, and provider wire field names.
   */
  readonly semanticReferenceRole?: MultimodalReferenceRole;
  /** Observability: which authority produced semanticReferenceRole. */
  readonly referenceRoleResolutionSource?: ReferenceRoleResolutionSource;
  readonly accessKind: MultimodalAccessKind;
  /** True when providerDelivery carries a usable visual reference. */
  readonly hasVisualProviderRef: boolean;
  /**
   * Already-resolved delivery for provider mappers (flag-ON semantic path).
   * Optional — documents may have extractedText only.
   */
  readonly providerDelivery?: MultimodalProviderDelivery;
  /** Bounded extracted text — never claimed to be the original file. */
  readonly extractedText?: string;
  readonly extractedTextChars?: number;
  readonly deliveryStatus: MultimodalDeliveryStatus;
  readonly sizeBytes?: number;
  readonly notes?: readonly string[];
};

export type MultimodalContextBounds = {
  readonly maxItems: number;
  readonly maxExtractedTextChars: number;
  readonly maxExtractedTextCharsPerItem: number;
};

export const DEFAULT_MULTIMODAL_BOUNDS: MultimodalContextBounds = Object.freeze({
  maxItems: 8,
  maxExtractedTextChars: 12_000,
  maxExtractedTextCharsPerItem: 6_000,
});

export type MultimodalContext = {
  readonly applied: boolean;
  readonly items: readonly MultimodalContextItem[];
  readonly selectionMethod: typeof MULTIMODAL_SELECTION_METHOD;
  readonly bounds: MultimodalContextBounds;
  readonly imageCount: number;
  readonly documentCount: number;
  readonly spreadsheetCount: number;
  readonly unsupportedCount: number;
  readonly extractedTextCount: number;
  readonly skippedCount: number;
  readonly truncated: boolean;
};

/** Input descriptor — already authorized / from trusted metadata. */
export type MultimodalInputDescriptor = {
  readonly sourceType: MultimodalSourceType;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly assetId?: string;
  readonly attachmentId?: string;
  readonly messageId?: string;
  readonly conversationId?: string;
  readonly organizationId?: string;
  readonly url?: string;
  readonly storageRef?: string;
  readonly sizeBytes?: number;
  readonly extractedText?: string;
  readonly hasVisualProviderRef?: boolean;
  readonly relationshipLabel?: string;
  readonly semanticReferenceRole?: MultimodalReferenceRole;
  readonly referenceRoleResolutionSource?: ReferenceRoleResolutionSource;
  readonly provenance?: readonly string[];
};

export type ProviderMultimodalCapabilities = {
  readonly supportsImageInput: boolean;
  readonly supportsPdfNativeInput: boolean;
  readonly supportsDocumentInput: boolean;
  readonly supportsSpreadsheetInput: boolean;
  readonly supportsExtractedTextFallback: boolean;
};

export const DEFAULT_TEXT_PROVIDER_MULTIMODAL_CAPABILITIES: ProviderMultimodalCapabilities =
  Object.freeze({
    supportsImageInput: true,
    supportsPdfNativeInput: false,
    supportsDocumentInput: true, // via extracted text in prompt
    supportsSpreadsheetInput: false,
    supportsExtractedTextFallback: true,
  });

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

export const PDF_MIME = "application/pdf" as const;
