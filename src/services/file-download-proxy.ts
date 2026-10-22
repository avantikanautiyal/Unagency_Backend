/**
 * Download proxy for chat deliverables.
 *
 * Files live in our S3 bucket, which has no CORS rule for the web app, and
 * public object URLs carry no Content-Disposition. Opening them in a tab shows
 * the file instead of saving it, and Windows browsers block that tab once an
 * async build has outlasted the click. The web app instead fetches the file
 * here (same API it already calls) and saves it from memory as a download.
 *
 * Only https URLs on our own bucket hosts are fetched — never arbitrary hosts.
 */

const MAX_BYTES = 1024 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;

function bucketNames(env = process.env): string[] {
  const names = new Set(["prakriadirect"]);
  for (const key of ["ENTERPRISE_BLOB_BUCKET", "AWS_BUCKET_NAME", "S3_BUCKET"]) {
    const v = env[key]?.trim().replace(/^"|"$/g, "");
    if (v) names.add(v);
  }
  return [...names];
}

/** True for https URLs on our S3 bucket hosts (virtual-hosted or path style). */
export function isAllowedDownloadUrl(raw: string, env = process.env): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  const s3Host = /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;
  return bucketNames(env).some((bucket) => {
    const b = bucket.toLowerCase();
    // Virtual-hosted style: <bucket>.s3[.<region>].amazonaws.com/key
    if (host.startsWith(`${b}.`) && s3Host.test(host.slice(b.length + 1))) return true;
    // Path style: s3[.<region>].amazonaws.com/<bucket>/key
    return s3Host.test(host) && url.pathname.startsWith(`/${bucket}/`);
  });
}

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/html": "html",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/**
 * A safe file name: the requested name, else the URL's last path segment,
 * with an extension matching the content type when it has none.
 */
export function downloadFileName(input: {
  requested?: string;
  url: string;
  contentType?: string;
}): string {
  let base = input.requested?.trim() ?? "";
  if (!base) {
    try {
      base = decodeURIComponent(new URL(input.url).pathname.split("/").pop() ?? "");
    } catch {
      base = "";
    }
  }
  // Windows rejects these characters and trailing dots/spaces in file names.
  base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").slice(0, 150);
  if (!base) base = "download";
  const mime = (input.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (ext && !/\.[a-z0-9]{2,5}$/i.test(base)) base = `${base}.${ext}`;
  return base;
}

/** The name a signed S3 URL already carries (response-content-disposition). */
export function fileNameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim());
    } catch {
      // fall through to the plain name
    }
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim() || undefined;
}

/** RFC 6266 header: ASCII fallback plus the UTF-8 name. */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export type ProxiedDownload = {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly contentLength?: number;
  readonly fileName: string;
};

export class DownloadProxyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function openProxiedDownload(input: {
  url: string;
  name?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProxiedDownload> {
  if (!isAllowedDownloadUrl(input.url)) {
    throw new DownloadProxyError("This file can't be downloaded from here", 400);
  }
  const res = await (input.fetchImpl ?? fetch)(input.url, {
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    throw new DownloadProxyError(
      res.status === 403 || res.status === 404
        ? "The download link has expired. Try the download again."
        : `File fetch failed (${res.status})`,
      res.status === 403 || res.status === 404 ? 410 : 502,
    );
  }
  const length = Number(res.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    throw new DownloadProxyError("File is too large to download here", 413);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return {
    body: res.body,
    contentType,
    ...(Number.isFinite(length) && length > 0 ? { contentLength: length } : {}),
    fileName: downloadFileName({
      requested: input.name || fileNameFromDisposition(res.headers.get("content-disposition")),
      url: input.url,
      contentType,
    }),
  };
}
