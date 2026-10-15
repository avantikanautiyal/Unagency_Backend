/**
 * Shareable live links for generated websites.
 *
 * A built site's HTML is an ordinary tenant artifact. Its public link is
 * `/sites/:artifactId?t=<token>`, where the token is an HMAC of the artifact
 * id — knowing an id alone is not enough to open someone's site, and links
 * never expire (unlike signed media URLs), so they can be shared.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

let processFallbackKey: Buffer | null = null;

function signingKey(): Buffer {
  const explicit = process.env.SITE_LINK_SECRET?.trim();
  if (explicit) return Buffer.from(explicit, "utf8");
  // Derived (one-way) from an existing server secret so links survive
  // restarts without new configuration. The source secret is never exposed.
  const derivedFrom = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (derivedFrom) {
    return createHash("sha256").update(`unagency-site-link:${derivedFrom}`).digest();
  }
  // Local/dev without secrets: links stay valid until the process restarts.
  processFallbackKey ??= randomBytes(32);
  return processFallbackKey;
}

export function siteLinkToken(artifactId: string): string {
  return createHmac("sha256", signingKey())
    .update(artifactId.trim())
    .digest("base64url")
    .slice(0, 32);
}

export function verifySiteLinkToken(artifactId: string, token: unknown): boolean {
  if (typeof token !== "string" || !token) return false;
  const expected = Buffer.from(siteLinkToken(artifactId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Relative path; clients prefix their API origin. */
export function hostedSitePath(artifactId: string): string {
  return `/sites/${encodeURIComponent(artifactId)}?t=${siteLinkToken(artifactId)}`;
}

/** Absolute link when the public API origin is configured. */
export function hostedSiteUrl(artifactId: string): string | undefined {
  const origin = process.env.ENTERPRISE_PUBLIC_API_ORIGIN?.trim().replace(/\/$/, "");
  if (!origin || !/^https?:\/\//i.test(origin)) return undefined;
  return `${origin}${hostedSitePath(artifactId)}`;
}

/**
 * Generated pages run in an opaque, sandboxed origin: scripts work, but the
 * page can never read the API domain's storage or cookies.
 */
export const HOSTED_SITE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "public, max-age=300",
};
