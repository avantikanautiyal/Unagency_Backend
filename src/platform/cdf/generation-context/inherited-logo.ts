/**
 * Phases that depend on an upstream logo-generating phase take the approved
 * upstream ArtifactVersion (bound by the upstream visual handoff) as their
 * identity mark. The brand vault/profile logo must not compete with it.
 */

import { cdfPhaseInheritsApprovedLogo } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/presentation-projection";

const BRAND_LOGO_KEYS = ["vaultLogoChoice", "brandLogoAssetId", "logoAssetId"] as const;

function readString(meta: Readonly<Record<string, unknown>>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

export function metadataInheritsApprovedLogo(
  meta: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!meta) return false;
  return cdfPhaseInheritsApprovedLogo(
    readString(meta, "cdfServiceId") || readString(meta, "serviceId"),
    readString(meta, "cdfPhaseId"),
  );
}

/** Drop brand/vault logo bindings (ids, assetIds entries, assets entries). */
export function stripBrandLogoBinding(
  meta: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const logoIds = new Set(
    BRAND_LOGO_KEYS.map((k) => readString(meta, k)).filter(Boolean),
  );
  const next: Record<string, unknown> = { ...meta };
  for (const k of BRAND_LOGO_KEYS) delete next[k];
  delete next.brandLogoProvenance;
  if (logoIds.size === 0) return next;

  if (Array.isArray(meta.assetIds)) {
    next.assetIds = meta.assetIds.filter(
      (id) => !(typeof id === "string" && logoIds.has(id.trim())),
    );
  }
  if (Array.isArray(meta.assets)) {
    next.assets = meta.assets.filter((a) => {
      if (!a || typeof a !== "object") return true;
      const rec = a as Record<string, unknown>;
      const id =
        (typeof rec.assetId === "string" && rec.assetId.trim()) ||
        (typeof rec.id === "string" && rec.id.trim()) ||
        "";
      return !logoIds.has(id);
    });
  }
  return next;
}
