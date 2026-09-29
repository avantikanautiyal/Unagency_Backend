/**
 * Provider compatibility: CanonicalModelRequest → existing provider payload shape.
 * Pure / deterministic. Does not resolve artifacts, requirements, storage, or CDF sessions.
 */

import {
  flattenCanonicalModelRequestToLabeledPrompt,
} from "./flatten-labeled";
import {
  countCanonicalContentParts,
  isCanonicalModelRequest,
  type CanonicalModelRequest,
} from "./types";

export type CanonicalProviderPayloadProjection = {
  readonly prompt: string;
  readonly text: string;
  readonly input: string;
  readonly messages: ReadonlyArray<{ role: "user"; content: string }>;
  readonly canonicalModelRequestApplied: true;
  readonly flattenedByProvider: true;
  readonly messageCount: number;
  readonly contentPartCount: number;
  readonly structuredPartCount: number;
  readonly generationContextHash?: string;
  /** Phase 9 — multimodal section present in labeled prompt. */
  readonly multimodalContextPresent?: boolean;
  readonly multimodalProviderMappedCount?: number;
  readonly multimodalProviderOmittedCount?: number;
};

function multimodalStatsFromRequest(request: CanonicalModelRequest): {
  multimodalContextPresent: boolean;
} {
  for (const m of request.messages) {
    for (const p of m.content) {
      if (p.type === "structured" && p.name === "multimodal_context") {
        return { multimodalContextPresent: true };
      }
    }
  }
  return { multimodalContextPresent: false };
}

/**
 * Map a resolved CanonicalModelRequest into the temporary string-oriented
 * provider payload used by current OpenAI / Anthropic / compat transports.
 * Does not call storage or attachment stores.
 */
export function mapCanonicalModelRequestToProviderPayload(
  request: CanonicalModelRequest,
  options?: {
    multimodalProviderMappedCount?: number;
    multimodalProviderOmittedCount?: number;
  },
): CanonicalProviderPayloadProjection {
  const flat = flattenCanonicalModelRequestToLabeledPrompt(request);
  const counts = countCanonicalContentParts(request);
  const mm = multimodalStatsFromRequest(request);
  return {
    prompt: flat,
    text: flat,
    input: flat,
    messages: [{ role: "user", content: flat }],
    canonicalModelRequestApplied: true,
    flattenedByProvider: true,
    messageCount: counts.messageCount,
    contentPartCount: counts.contentPartCount,
    structuredPartCount: counts.structuredPartCount,
    generationContextHash: request.metadata?.generationContextHash,
    multimodalContextPresent: mm.multimodalContextPresent,
    multimodalProviderMappedCount: options?.multimodalProviderMappedCount,
    multimodalProviderOmittedCount: options?.multimodalProviderOmittedCount,
  };
}

/**
 * Resolve CanonicalModelRequest from Direct/Provider metadata or payload.
 */
export function resolveCanonicalModelRequestFromCarrier(
  carrier: Readonly<Record<string, unknown>> | undefined,
): CanonicalModelRequest | undefined {
  if (!carrier) return undefined;
  const direct = carrier.canonicalModelRequest;
  if (isCanonicalModelRequest(direct)) return direct;
  return undefined;
}
