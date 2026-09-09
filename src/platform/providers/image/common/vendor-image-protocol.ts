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
  return extractReferenceImages(payload)[0];
}

/** All image assets / image fields on a payload (multi-reference future). */
export function extractReferenceImages(
  payload: Readonly<Record<string, unknown>>
): readonly ReferenceImagePayload[] {
  const candidates: unknown[] = [];
  if (payload.image) candidates.push(payload.image);
  if (Array.isArray(payload.assets)) candidates.push(...payload.assets);

  const out: ReferenceImagePayload[] = [];
  const seen = new Set<string>();
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
    let resolved: ReferenceImagePayload | undefined;
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/i);
      if (match?.[1] && match[2]) {
        resolved = { mimeType: mimeType ?? match[1], base64: match[2], url };
      }
    } else {
      const b64 =
        typeof rec.base64 === "string"
          ? rec.base64
          : typeof rec.data === "string" && !String(rec.data).startsWith("http")
            ? rec.data
            : undefined;
      if (b64 && (mimeType || url.startsWith("http"))) {
        resolved = {
          mimeType: mimeType ?? "image/png",
          base64: b64,
          url: url || undefined,
        };
      } else if (url.startsWith("http") && (mimeType || !rec.mimeType)) {
        resolved = { mimeType: mimeType ?? "image/png", url };
      }
    }
    if (!resolved) continue;
    const key = resolved.base64?.slice(0, 64) || resolved.url || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return Object.freeze(out);
}

/** Data URL suitable for vendor JSON bodies (OpenAI edits, Recraft style refs). */
export function referenceImageToDataUrl(
  image: ReferenceImagePayload
): string | undefined {
  if (image.url?.startsWith("data:")) return image.url;
  if (image.url?.startsWith("http")) return image.url;
  if (image.base64?.trim()) {
    return `data:${image.mimeType || "image/png"};base64,${image.base64.trim()}`;
  }
  return undefined;
}
