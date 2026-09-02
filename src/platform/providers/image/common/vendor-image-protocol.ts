/**
 * Vendor image protocol — maps canonical image.generate to verified wire contracts.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ImageHttpRequest } from "../http/image-http-client";

export interface VendorImageAuthContext {
  readonly apiKey?: string;
}

export interface VendorImageWirePlan {
  readonly request: ImageHttpRequest;
  /** Optional follow-up poll plan (BFL async). */
  readonly pollPathTemplate?: string;
}

export interface VendorImageNormalizedResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
}

export interface IVendorImageProtocol {
  readonly vendor: string;
  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean;
  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan;
  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult;
  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string;
}

export function resolveImageWireModelId(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/").slice(-1)[0] ?? modelId : modelId;
}

export function extractPrompt(payload: Readonly<Record<string, unknown>>): string {
  return String(payload.prompt ?? payload.text ?? payload.input ?? "").trim();
}

export type ReferenceImagePayload = {
  readonly mimeType: string;
  readonly base64?: string;
  readonly url?: string;
};

/** First image asset / image field on an image.generate payload (logo, reference still). */
export function extractReferenceImage(
  payload: Readonly<Record<string, unknown>>
): ReferenceImagePayload | undefined {
  const candidates: unknown[] = [];
  if (payload.image) candidates.push(payload.image);
  if (Array.isArray(payload.assets)) candidates.push(...payload.assets);

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const rec = candidate as Record<string, unknown>;
    const mimeType =
      typeof rec.mimeType === "string" && rec.mimeType.startsWith("image/")
        ? rec.mimeType
        : typeof rec.mime_type === "string" && rec.mime_type.startsWith("image/")
          ? rec.mime_type
          : undefined;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/i);
      if (match?.[1] && match[2]) {
        return { mimeType: mimeType ?? match[1], base64: match[2], url };
      }
    }
    const b64 =
      typeof rec.base64 === "string"
        ? rec.base64
        : typeof rec.data === "string" && !String(rec.data).startsWith("http")
          ? rec.data
          : undefined;
    if (b64 && (mimeType || url.startsWith("http"))) {
      return { mimeType: mimeType ?? "image/png", base64: b64, url: url || undefined };
    }
    if (url.startsWith("http") && (mimeType || !rec.mimeType)) {
      return { mimeType: mimeType ?? "image/png", url };
    }
  }
  return undefined;
}
