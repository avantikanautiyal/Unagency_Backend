/**
 * M10.18 — Shared upload pipeline (validation → hash → scan → duplicate check).
 * Single authority used by product assets and legacy upload bridge.
 */

import { createHash } from "crypto";
import {
  DEFAULT_MEDIA_SIZE_LIMITS,
  inferMediaCategory,
  maxBytesForCategory,
  type MediaCategory,
} from "../ingestion/media-size-limits";
import { getVirusScanHook, type VirusScanResult } from "./virus-scan-hook";

export const PRODUCT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/x-aac",
  "audio/webm",
]);

export type UploadValidationOk = {
  readonly ok: true;
  readonly mimeType: string;
  readonly category: MediaCategory;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly scan: VirusScanResult;
};

export type UploadValidationErr = {
  readonly ok: false;
  readonly statusCode: number;
  readonly message: string;
};

export type UploadValidationResult = UploadValidationOk | UploadValidationErr;

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runUploadPipeline(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  organizationId: string;
  allowedMime?: Set<string>;
  sizeLimits?: typeof DEFAULT_MEDIA_SIZE_LIMITS;
  skipVirusScan?: boolean;
}): Promise<UploadValidationResult> {
  const mime = (input.mimeType || "").toLowerCase().trim();
  const allowed = input.allowedMime ?? PRODUCT_ALLOWED_MIME;
  if (!mime || !allowed.has(mime)) {
    return { ok: false, statusCode: 400, message: "MIME type not allowed" };
  }
  if (input.bytes.byteLength <= 0) {
    return { ok: false, statusCode: 400, message: "Zero-byte uploads are rejected" };
  }
  const category = inferMediaCategory(mime);
  const max = maxBytesForCategory(category, input.sizeLimits ?? DEFAULT_MEDIA_SIZE_LIMITS);
  if (input.bytes.byteLength > max) {
    return {
      ok: false,
      statusCode: 400,
      message: `File exceeds size limit (${max} bytes)`,
    };
  }

  const checksum = sha256Hex(input.bytes);

  let scan: VirusScanResult;
  if (input.skipVirusScan) {
    scan = {
      verdict: "skipped",
      engine: "skip",
      scannedAt: new Date().toISOString(),
    };
  } else {
    scan = await getVirusScanHook().scan({
      bytes: input.bytes,
      mimeType: mime,
      filename: input.filename,
      organizationId: input.organizationId,
    });
  }

  if (scan.verdict === "infected") {
    return {
      ok: false,
      statusCode: 422,
      message: `Upload rejected by virus scan${scan.detail ? `: ${scan.detail}` : ""}`,
    };
  }

  return {
    ok: true,
    mimeType: mime,
    category,
    sizeBytes: input.bytes.byteLength,
    checksum,
    scan,
  };
}

/** Cache-Control for product vs immutable execution artifacts */
export function cacheControlForAsset(kind: "product" | "artifact_immutable"): string {
  if (kind === "artifact_immutable") {
    return "private, max-age=31536000, immutable";
  }
  return "private, max-age=300, must-revalidate";
}
