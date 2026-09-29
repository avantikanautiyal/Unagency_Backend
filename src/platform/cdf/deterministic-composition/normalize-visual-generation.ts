/**
 * Normalize provider/diagnostic visual media into VisualGenerationResult.
 * No provider / service / platform semantic branches.
 */

import type { VisualGenerationResult } from "./types";

export type NormalizeVisualGenerationInput = {
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly provenance?: VisualGenerationResult["provenance"];
  readonly generationMeta?: Readonly<Record<string, unknown>>;
};

function sniffMime(bytes: Uint8Array | Buffer): string {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

/**
 * Convert opaque visual bytes into the generic compositor input shape.
 */
export function normalizeVisualGenerationResult(
  input: NormalizeVisualGenerationInput,
): VisualGenerationResult | { ok: false; reason: string } {
  if (!input.bytes || input.bytes.length < 8) {
    return { ok: false, reason: "visual_bytes_missing_or_too_small" };
  }
  const mimeType = input.mimeType?.trim() || sniffMime(input.bytes);
  if (!mimeType.startsWith("image/")) {
    return { ok: false, reason: "visual_mime_not_image" };
  }
  return {
    bytes: input.bytes,
    mimeType,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    provenance: input.provenance ?? "generated",
    generationMeta: input.generationMeta,
  };
}
