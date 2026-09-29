/**
 * Resolve authoritative brand-mark bytes for deterministic composition.
 *
 * Prefer existing execution authority already attached for providers
 * (logo asset ids + assets[] data URLs). Optional base64 stamp is a fallback,
 * not a required FE duplication of primary message / brand semantics.
 *
 * No service / platform / provider branches.
 */

import type { CompositionBrandMarkInput } from "./types";

function decodeDataUrl(url: string): { bytes: Buffer; mimeType: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i.exec(url.trim());
  if (!m) return null;
  const mimeType = (m[1] || "image/png").trim() || "image/png";
  const isB64 = Boolean(m[2]);
  const payload = m[3] || "";
  try {
    const bytes = isB64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    if (bytes.length < 8) return null;
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

function logoAssetIds(meta: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const key of ["logoAssetId", "brandLogoAssetId"] as const) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) ids.add(v.trim());
  }
  return ids;
}

function assetIdOf(rec: Record<string, unknown>): string | undefined {
  if (typeof rec.assetId === "string" && rec.assetId.trim()) {
    return rec.assetId.trim();
  }
  if (typeof rec.id === "string" && rec.id.trim()) return rec.id.trim();
  return undefined;
}

function isLogoRole(rec: Record<string, unknown>): boolean {
  const role =
    (typeof rec.semanticReferenceRole === "string" &&
      rec.semanticReferenceRole) ||
    (typeof rec.brandAssetRole === "string" && rec.brandAssetRole) ||
    (typeof rec.role === "string" && rec.role) ||
    "";
  const r = role.toLowerCase();
  return (
    r === "identity_mark" ||
    r === "logo" ||
    r === "brand_logo" ||
    r === "brand_mark"
  );
}

function fromBase64Stamp(
  meta: Record<string, unknown>,
): CompositionBrandMarkInput | null {
  const b64 =
    typeof meta.cdfCompositionBrandMarkBase64 === "string"
      ? meta.cdfCompositionBrandMarkBase64
      : null;
  if (!b64) return null;
  try {
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length < 8) return null;
    return {
      bytes,
      mimeType:
        typeof meta.cdfCompositionBrandMarkMimeType === "string"
          ? meta.cdfCompositionBrandMarkMimeType
          : "image/png",
      assetId:
        typeof meta.brandLogoAssetId === "string"
          ? meta.brandLogoAssetId
          : typeof meta.logoAssetId === "string"
            ? meta.logoAssetId
            : undefined,
      provenance: "execution_metadata_base64_stamp",
    };
  } catch {
    return null;
  }
}

function fromAssetsArray(
  meta: Record<string, unknown>,
): CompositionBrandMarkInput | null {
  const assets = meta.assets;
  if (!Array.isArray(assets)) return null;
  const logoIds = logoAssetIds(meta);

  const ranked: Array<{
    score: number;
    rec: Record<string, unknown>;
    decoded: { bytes: Buffer; mimeType: string };
  }> = [];

  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url : null;
    if (!url || !url.startsWith("data:")) continue;
    const decoded = decodeDataUrl(url);
    if (!decoded) continue;
    if (!decoded.mimeType.startsWith("image/")) continue;

    const id = assetIdOf(rec);
    let score = 0;
    if (id && logoIds.has(id)) score += 100;
    if (isLogoRole(rec)) score += 50;
    if (logoIds.size === 0 && score === 0) score += 1; // last resort: first image
    if (score === 0) continue;
    ranked.push({ score, rec, decoded });
  }

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  return {
    bytes: best.decoded.bytes,
    mimeType: best.decoded.mimeType,
    assetId: assetIdOf(best.rec),
    provenance: "execution_metadata_assets_data_url",
  };
}

/**
 * Resolve brand mark bytes from existing execution authority surfaces.
 */
export function resolveBrandMarkFromExecutionAuthority(
  meta: Record<string, unknown> | undefined,
): CompositionBrandMarkInput | null {
  if (!meta) return null;
  return fromBase64Stamp(meta) ?? fromAssetsArray(meta);
}
