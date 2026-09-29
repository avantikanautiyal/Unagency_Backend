/**
 * M8F — Packaging final/download eligibility.
 *
 * Never silently maps unsupported_representation → legacy art_*.
 * FORCE_LEGACY_DOWNLOAD kill-switch removed.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  isPackagingArtifactKey,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";

export const CDF_PACKAGING_DOWNLOAD_RUNTIME_VERSION = "m8f.packaging.download.v1";

/**
 * Canonical download is authoritative for CDF Packaging.
 * Env CDF_PACKAGING_CANONICAL_DOWNLOAD eradicated — always on.
 */
export function isPackagingCanonicalDownloadEnabled(): boolean {
  return true;
}

export type PackagingDownloadCta =
  | "download_packaging_files"
  | "download_3d_mockups"
  | "create_another_sku"
  | "other";

export type PackagingDownloadEligibility =
  | {
      decision: "canonical_capable";
      artifactId: string;
      artifactVersion: number;
      artifactKey: PackagingArtifactKey;
      format: "png" | "jpg";
      purpose: "final";
      cta: PackagingDownloadCta;
      reason: string;
    }
  | {
      decision: "legacy_only";
      cta: PackagingDownloadCta;
      reason: string;
      legacyCompatible: true;
    }
  | {
      decision: "unsupported_representation";
      cta: PackagingDownloadCta;
      artifactId?: string;
      artifactVersion?: number;
      artifactKey?: string;
      format?: string;
      reason: string;
      /** Explicit: must NOT fall back to art_*. */
      silentLegacyFallbackForbidden: true;
    }
  | {
      decision: "no_canonical_artifact";
      cta: PackagingDownloadCta;
      reason: string;
      silentLegacyFallbackForbidden: true;
      legacyCompatible?: false;
    }
  | {
      decision: "not_a_download";
      cta: "create_another_sku";
      reason: string;
    };

const RASTER_KEYS = new Set<string>([
  PACKAGING_ARTIFACT_KEYS.threeDDirection,
  PACKAGING_ARTIFACT_KEYS.frontPack,
  PACKAGING_ARTIFACT_KEYS.completePack,
  PACKAGING_ARTIFACT_KEYS.views,
  PACKAGING_ARTIFACT_KEYS.skuAdaptations,
]);

/** Preferred keys per CTA (evidence: live CTAs are identical rasters; differentiate by intent). */
export const PACKAGING_CTA_PREFERRED_KEYS: Record<
  "download_packaging_files" | "download_3d_mockups",
  readonly PackagingArtifactKey[]
> = {
  download_packaging_files: [
    PACKAGING_ARTIFACT_KEYS.skuAdaptations,
    PACKAGING_ARTIFACT_KEYS.completePack,
    PACKAGING_ARTIFACT_KEYS.frontPack,
  ],
  download_3d_mockups: [
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
    PACKAGING_ARTIFACT_KEYS.views,
  ],
};

export function classifyPackagingDownloadCta(label: string): PackagingDownloadCta {
  const key = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (key === "download packaging files") return "download_packaging_files";
  if (key === "download 3d mockups") return "download_3d_mockups";
  if (key === "create another sku") return "create_another_sku";
  return "other";
}

export type PackagingCanonicalPin = {
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  validationStatus?: string;
  runtimePath?: string;
  canonicalRejected?: boolean;
  fallbackReason?: string;
  preferLegacyDownload?: boolean;
};

/**
 * Decide whether a Packaging CTA may use canonical RenderedFile.
 * Does not invent formats beyond png/jpg.
 */
export function evaluatePackagingDownloadEligibility(input: {
  label: string;
  format?: string | null;
  pin?: PackagingCanonicalPin | null;
  /** When false, always legacy_only / no_canonical even if pin exists. */
  canonicalDownloadEnabled?: boolean;
}): PackagingDownloadEligibility {
  const cta = classifyPackagingDownloadCta(input.label);

  if (cta === "create_another_sku") {
    return {
      decision: "not_a_download",
      cta: "create_another_sku",
      reason: "Create Another SKU is a Packaging adaptation action, not a representation",
    };
  }

  if (cta === "other") {
    return {
      decision: "legacy_only",
      cta,
      reason: "Non-Packaging or unrecognized CTA — preserve legacy path",
      legacyCompatible: true,
    };
  }

  const enabled =
    input.canonicalDownloadEnabled ?? isPackagingCanonicalDownloadEnabled();
  if (!enabled) {
    return {
      decision: "unsupported_representation",
      cta,
      reason:
        "Canonical Packaging download required — art_* fallback eradicated",
      silentLegacyFallbackForbidden: true,
    };
  }

  const pin = input.pin;
  if (!pin?.artifactId?.startsWith("cdfart_")) {
    return {
      decision: "no_canonical_artifact",
      cta,
      reason:
        "No canonical Packaging ArtifactVersion pin — refusing art_* fallback",
      silentLegacyFallbackForbidden: true,
    };
  }

  if (
    pin.artifactVersion == null ||
    !Number.isInteger(pin.artifactVersion) ||
    pin.artifactVersion < 1
  ) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      reason: "Canonical pin missing exact artifactVersion — refusing latest/legacy fallback",
      silentLegacyFallbackForbidden: true,
    };
  }

  if (pin.preferLegacyDownload === true) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason:
        "cdfPreferLegacyDownload is obsolete — canonical download required",
      silentLegacyFallbackForbidden: true,
    };
  }

  if (pin.canonicalRejected === true || pin.runtimePath === "none") {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: "Canonical Packaging artifact was rejected — do not use art_* silently",
      silentLegacyFallbackForbidden: true,
    };
  }

  const status = pin.validationStatus?.trim().toLowerCase();
  if (status === "failed" || status === "requires_clarification") {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: `M4 status ${status} — no canonical download`,
      silentLegacyFallbackForbidden: true,
    };
  }

  if (!isPackagingArtifactKey(pin.artifactKey) || !RASTER_KEYS.has(pin.artifactKey)) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: `Artifact key ${pin.artifactKey} has no Packaging raster renderer`,
      silentLegacyFallbackForbidden: true,
    };
  }

  const formatRaw = (input.format ?? "png").toLowerCase();
  const format =
    formatRaw === "jpg" || formatRaw === "jpeg"
      ? "jpg"
      : formatRaw === "png"
        ? "png"
        : null;

  if (!format) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      format: formatRaw,
      reason: `Format ${formatRaw} is not a confirmed Packaging representation (png/jpg only)`,
      silentLegacyFallbackForbidden: true,
    };
  }

  // Prefer CTA-aligned keys when possible; still allow any raster packaging pin
  // because live CTAs historically share one primary art_* without distinction.
  const preferred = PACKAGING_CTA_PREFERRED_KEYS[cta];
  const keyOk =
    preferred.includes(pin.artifactKey as PackagingArtifactKey) ||
    RASTER_KEYS.has(pin.artifactKey);

  if (!keyOk) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: "Pin artifact key is not a Packaging raster representation key",
      silentLegacyFallbackForbidden: true,
    };
  }

  return {
    decision: "canonical_capable",
    artifactId: pin.artifactId,
    artifactVersion: pin.artifactVersion,
    artifactKey: pin.artifactKey as PackagingArtifactKey,
    format,
    purpose: "final",
    cta,
    reason: `Canonical Packaging download via packaging-preview-raster (${format})`,
  };
}
