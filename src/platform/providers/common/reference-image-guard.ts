/**
 * Last check before a reference file is sent to an image or vision model.
 *
 * Providers accept only real images (PNG/JPEG/WEBP/GIF). Anything else — a
 * PDF, Word file or ZIP that reached the payload — fails with HTTP 400 at
 * every provider, so it is dropped here instead. Leading bytes win over the
 * declared type, which also corrects a mislabelled image.
 */

export type SniffedFileType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "application/pdf"
  | "application/zip"
  | undefined;

const PROVIDER_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function baseMime(mime: string | undefined): string {
  return (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
}

export function isProviderImageMimeType(mime: string | undefined): boolean {
  return PROVIDER_IMAGE_MIME_TYPES.has(baseMime(mime));
}

/** File type from leading bytes (magic numbers); undefined when unknown. */
export function sniffFileType(b: Uint8Array): SniffedFileType {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  // ZIP containers: .zip, .docx, .pptx, .xlsx all start with "PK".
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) {
    return "application/zip";
  }
  return undefined;
}

/** First bytes of a base64 string, decoded (enough for sniffFileType). */
export function leadingBytesFromBase64(base64: string, count = 16): Uint8Array {
  const chars = Math.ceil(count / 3) * 4;
  try {
    return new Uint8Array(Buffer.from(base64.slice(0, chars), "base64"));
  } catch {
    return new Uint8Array();
  }
}

export type ReferenceImageScreen =
  | { readonly ok: true; readonly mimeType: string; readonly base64?: string; readonly url?: string }
  | { readonly ok: false; readonly reason: string; readonly detectedMimeType?: string };

/**
 * Decide whether a reference can be sent as an image.
 * - data: URL → must decode to a real image (bytes checked)
 * - base64 → bytes checked
 * - http(s) URL → accepted unless its declared type is a non-image
 */
export function screenReferenceImage(input: {
  readonly mimeType?: string;
  readonly url?: string;
  readonly base64?: string;
}): ReferenceImageScreen {
  const declared = baseMime(input.mimeType);
  const url = input.url?.trim() ?? "";
  let base64 = input.base64;
  let urlMime = "";
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
    if (!match) return { ok: false, reason: "malformed_data_url" };
    urlMime = baseMime(match[1]);
    if (!match[2]) return { ok: false, reason: "data_url_not_base64", detectedMimeType: urlMime };
    base64 = base64 ?? match[3];
  }
  if (base64) {
    const sniffed = sniffFileType(leadingBytesFromBase64(base64));
    if (sniffed && !sniffed.startsWith("image/")) {
      return { ok: false, reason: "not_an_image", detectedMimeType: sniffed };
    }
    if (sniffed) {
      return { ok: true, mimeType: sniffed, base64, ...(url && !url.startsWith("data:") ? { url } : {}) };
    }
    // Unknown bytes: trust a declared image type only.
    const claimed = urlMime || declared;
    if (claimed && !isProviderImageMimeType(claimed)) {
      return { ok: false, reason: "not_an_image", detectedMimeType: claimed };
    }
    return { ok: true, mimeType: claimed || "image/png", base64, ...(url && !url.startsWith("data:") ? { url } : {}) };
  }
  if (url) {
    if (declared && !declared.startsWith("image/")) {
      return { ok: false, reason: "not_an_image", detectedMimeType: declared };
    }
    return { ok: true, mimeType: declared || "image/png", url };
  }
  return { ok: false, reason: "no_image_data" };
}

/** Structured log when a reference is dropped (no bytes, no URLs). */
export function logDroppedReference(input: {
  readonly where: string;
  readonly reason: string;
  readonly detectedMimeType?: string;
  readonly assetId?: string;
}): void {
  console.warn(
    JSON.stringify({
      scope: "provider.reference_image_guard",
      event: "non_image_reference_dropped",
      where: input.where,
      reason: input.reason,
      ...(input.detectedMimeType ? { detectedMimeType: input.detectedMimeType } : {}),
      ...(input.assetId ? { assetId: input.assetId } : {}),
    }),
  );
}
