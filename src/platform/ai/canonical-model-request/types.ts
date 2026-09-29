/**
 * Provider-neutral CanonicalModelRequest (Phase 4+).
 * Semantic multi-part model request — not OpenAI ChatCompletion types.
 * Phase 9: multimodal context is represented as structured parts (identity +
 * extracted text). Binary/provider wire shapes stay at the provider boundary.
 */

export type CanonicalMessageRole =
  | "system"
  | "developer"
  | "user"
  | "assistant";

export type CanonicalTextPart = {
  readonly type: "text";
  readonly text: string;
  /** Application semantic role (e.g. current_user_instruction). */
  readonly semanticRole?: string;
};

export type CanonicalStructuredPart = {
  readonly type: "structured";
  readonly name: string;
  readonly data: unknown;
  readonly schema?: string;
  readonly version?: string;
  readonly semanticRole?: string;
};

export type CanonicalContentPart = CanonicalTextPart | CanonicalStructuredPart;

export type CanonicalMessage = {
  readonly role: CanonicalMessageRole;
  readonly content: readonly CanonicalContentPart[];
};

export type CanonicalOutputContract = {
  readonly name: string;
  readonly schema?: Record<string, unknown>;
  readonly version?: string;
  readonly required: boolean;
  readonly instructions?: readonly string[];
  readonly phaseId?: string;
  readonly artifactKey?: string;
  readonly generationModality?: string;
  readonly canonicalFullDeck?: boolean;
};

export type CanonicalModelContext = {
  readonly requirements?: unknown;
  readonly constraints?: unknown;
  readonly exclusions?: unknown;
  readonly selections?: unknown;
  readonly approvedDecisions?: unknown;
  readonly cdfPhase?: unknown;
  readonly currentTask?: unknown;
};

export type CanonicalRequestMetadata = {
  readonly generationContextHash?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly serviceId?: string;
  readonly source?: string;
  readonly messageCount?: number;
  readonly contentPartCount?: number;
  readonly structuredPartCount?: number;
};

/**
 * Already-resolved visual delivery for a multimodal_context item.
 * Carried beside messages so provider mappers can map images without
 * embedding signed URLs / bytes into prompt/log surfaces.
 * Provider-neutral (not OpenAI image_url / Anthropic source blocks).
 */
export type CanonicalMultimodalProviderDeliveryBag = {
  readonly itemId: string;
  readonly assetId?: string;
  readonly attachmentId?: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly url?: string;
  readonly storageRef?: string;
};

/**
 * Single canonical semantic request representation for model invocations.
 * Application layers compile this; provider compatibility may flatten it.
 */
export type CanonicalModelRequest = {
  readonly messages: readonly CanonicalMessage[];
  readonly context?: CanonicalModelContext;
  readonly outputContract?: CanonicalOutputContract;
  readonly metadata?: CanonicalRequestMetadata;
  /**
   * Phase 9A — delivery bag keyed by multimodal itemId.
   * Semantic identity lives in multimodal_context parts; this bag supplies
   * already-resolved urls/storageRefs for provider mappers only.
   */
  readonly multimodalProviderDeliveries?: readonly CanonicalMultimodalProviderDeliveryBag[];
};

/** Metadata / payload key carrying CanonicalModelRequest through execution. */
export const CANONICAL_MODEL_REQUEST_META_KEY = "canonicalModelRequest" as const;

/**
 * Non-semantic placeholder for DirectExecutionRequest.rawPrompt when the
 * structured CanonicalModelRequest is the source of truth.
 */
export const CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER =
  "[unagency:canonical_model_request]" as const;

export function isCanonicalModelRequest(
  value: unknown,
): value is CanonicalModelRequest {
  if (!value || typeof value !== "object") return false;
  const messages = (value as { messages?: unknown }).messages;
  return Array.isArray(messages);
}

export function countCanonicalContentParts(
  request: CanonicalModelRequest,
): {
  messageCount: number;
  contentPartCount: number;
  structuredPartCount: number;
} {
  let contentPartCount = 0;
  let structuredPartCount = 0;
  for (const m of request.messages) {
    for (const p of m.content) {
      contentPartCount += 1;
      if (p.type === "structured") structuredPartCount += 1;
    }
  }
  return {
    messageCount: request.messages.length,
    contentPartCount,
    structuredPartCount,
  };
}
