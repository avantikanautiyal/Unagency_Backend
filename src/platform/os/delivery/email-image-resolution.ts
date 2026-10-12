/**
 * Make every image in a generated email real.
 *
 * The model writes the email's HTML and cannot know where images live, so its
 * <img> addresses usually point nowhere. Before the file is saved:
 *  - a logo image is pointed at a permanent public copy of the brand's logo;
 *  - any other image whose address does not load is replaced with a working
 *    image found for its description, or removed when none can be found —
 *    a delivered email must never contain a broken picture.
 *
 * Every dependency is injectable; failures never block the email itself.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import AwsS3 from "../../../config/aws.config";

/** Same public bucket chat uploads use — files here are readable by link. */
const PUBLIC_BUCKET = "prakriadirect";
const PUBLIC_BUCKET_REGION = "ap-south-1";
const MAX_IMAGES = 8;
const IMAGE_CHECK_TIMEOUT_MS = 4_000;
const SEARCH_TIMEOUT_MS = 8_000;

export type EmailImageDeps = {
  /** Permanent public address for the brand logo, or undefined. */
  readonly publishLogo: () => Promise<string | undefined>;
  /** Candidate image addresses for a description, best first. */
  readonly searchImages: (query: string) => Promise<readonly string[]>;
  /** True when the address loads and is an image. */
  readonly isWorkingImage: (url: string) => Promise<boolean>;
};

export type EmailImageReport = {
  readonly logoReplaced: number;
  readonly kept: number;
  readonly replaced: number;
  readonly removed: number;
};

function attr(tag: string, name: string): string {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

function withSrc(tag: string, url: string): string {
  const safe = url.replace(/"/g, "&quot;");
  return /\bsrc\s*=/i.test(tag)
    ? tag.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `src="${safe}"`)
    : tag.replace(/<img\b/i, `<img src="${safe}"`);
}

function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
      return false;
    }
    // Literal private / loopback / link-local addresses are never fetched.
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      const [a, b] = host.split(".").map(Number) as [number, number];
      if (a === 10 || a === 127 || a === 0) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
    }
    if (host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function resolveEmailImages(
  html: string,
  input: {
    readonly deps: EmailImageDeps;
    /** Added to image searches so results fit the brand / campaign. */
    readonly context?: string;
  },
): Promise<{ html: string; report: EmailImageReport }> {
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const report = { logoReplaced: 0, kept: 0, replaced: 0, removed: 0 };
  if (tags.length === 0) return { html, report };

  let logoUrl: string | undefined;
  let logoTried = false;
  const used = new Set<string>();
  const replacements = new Map<string, string>();

  for (const tag of [...new Set(tags)].slice(0, MAX_IMAGES)) {
    const src = attr(tag, "src");
    const alt = attr(tag, "alt");

    if (/logo/i.test(tag)) {
      if (!logoTried) {
        logoTried = true;
        logoUrl = await input.deps.publishLogo().catch(() => undefined);
      }
      if (logoUrl) {
        replacements.set(tag, withSrc(tag, logoUrl));
        report.logoReplaced += 1;
        continue;
      }
    }

    if (src && isPublicHttpsUrl(src) && (await input.deps.isWorkingImage(src))) {
      report.kept += 1;
      used.add(src);
      continue;
    }

    // Decorative spacers / tracking pixels carry no description — drop them.
    const query = [alt, input.context].filter(Boolean).join(" — ").slice(0, 200);
    let found: string | undefined;
    if (alt) {
      const candidates = await input.deps.searchImages(query).catch(() => []);
      for (const candidate of candidates.slice(0, 6)) {
        if (used.has(candidate) || !isPublicHttpsUrl(candidate)) continue;
        if (await input.deps.isWorkingImage(candidate)) {
          found = candidate;
          break;
        }
      }
    }
    if (found) {
      used.add(found);
      replacements.set(tag, withSrc(tag, found));
      report.replaced += 1;
    } else {
      replacements.set(tag, "");
      report.removed += 1;
    }
  }

  let out = html;
  for (const [tag, next] of replacements) out = out.split(tag).join(next);
  return { html: out, report };
}

// ─── Production dependencies ────────────────────────────────────────────────

async function defaultIsWorkingImage(url: string): Promise<boolean> {
  if (!isPublicHttpsUrl(url)) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1023", Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS),
    });
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    void res.body?.cancel().catch(() => undefined);
    return (res.status === 200 || res.status === 206) && type.startsWith("image/");
  } catch {
    return false;
  }
}

async function defaultSearchImages(query: string): Promise<readonly string[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key || process.env.TAVILY_ENABLED === "false") return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      include_images: true,
      max_results: 5,
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { images?: unknown };
  const images = Array.isArray(body.images) ? body.images : [];
  return images
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String((item as { url?: unknown }).url ?? "")
          : "",
    )
    .filter((url) => url.startsWith("https://"));
}

const LOGO_EXT: Readonly<Record<string, string>> = {
  "89504e47": "png",
  ffd8ff: "jpg",
  "47494638": "gif",
  "52494646": "webp",
};

function logoFormat(bytes: Uint8Array): { ext: string; mime: string } | undefined {
  const head = Buffer.from(bytes.slice(0, 4)).toString("hex");
  const hit = Object.entries(LOGO_EXT).find(([sig]) => head.startsWith(sig));
  if (!hit) return undefined;
  const ext = hit[1];
  return { ext, mime: ext === "jpg" ? "image/jpeg" : `image/${ext}` };
}

/** Publish the brand logo once at a stable public address (re-publishing overwrites it). */
async function publishBrandLogo(input: {
  logoAssetId: string;
  organizationId: string;
}): Promise<string | undefined> {
  const { getDefaultVaultAssetResolver } = await import(
    "../../cdf/rendering/default-vault-asset-resolver"
  );
  const resolver = getDefaultVaultAssetResolver();
  if (!resolver) return undefined;
  // Tenant-scoped read: only this organization's own logo can be published.
  const bytes = await resolver.resolve({
    vaultAssetId: input.logoAssetId,
    organizationId: input.organizationId,
  });
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) {
    return undefined;
  }
  const format = logoFormat(bytes);
  if (!format) return undefined;
  const key = `brand-logos/${input.organizationId}/${input.logoAssetId}.${format.ext}`;
  await AwsS3.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: format.mime,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000",
    }),
  );
  return `https://${PUBLIC_BUCKET}.s3.${PUBLIC_BUCKET_REGION}.amazonaws.com/${key}`;
}

export function productionEmailImageDeps(input: {
  organizationId: string;
  metadata?: Readonly<Record<string, unknown>>;
}): EmailImageDeps {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const logoAssetId =
    str(input.metadata?.brandLogoAssetId) || str(input.metadata?.logoAssetId);
  return {
    publishLogo: async () =>
      /^[a-f0-9]{24}$/i.test(logoAssetId) && input.organizationId
        ? publishBrandLogo({ logoAssetId, organizationId: input.organizationId })
        : undefined,
    searchImages: defaultSearchImages,
    isWorkingImage: defaultIsWorkingImage,
  };
}
