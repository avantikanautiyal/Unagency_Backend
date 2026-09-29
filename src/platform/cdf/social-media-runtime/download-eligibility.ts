/**
 * M9F — Social Media final/download eligibility.
 *
 * Never silently maps unsupported / lifecycle_blocked → legacy art_*.
 * FORCE_LEGACY_DOWNLOAD kill-switch removed — cannot re-enable art_* as canonical.
 */

import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  isSocialMediaArtifactKey,
  type SocialMediaArtifactKey,
} from "../artifacts/social-media/keys";

export const CDF_SOCIAL_MEDIA_DOWNLOAD_RUNTIME_VERSION =
  "m9f.social_media.download.v1";

/**
 * Canonical download is authoritative for CDF Social Media.
 * Env CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD eradicated — always on.
 */
export function isSocialMediaCanonicalDownloadEnabled(): boolean {
  return true;
}

export type SocialMediaDownloadCta =
  | "download"
  | "create_another_size"
  | "request_adaptation"
  | "other";

export type SocialMediaDownloadEligibility =
  | {
      decision: "canonical_capable";
      artifactId: string;
      artifactVersion: number;
      artifactKey: SocialMediaArtifactKey;
      format: "png" | "jpg";
      purpose: "final";
      cta: SocialMediaDownloadCta;
      reason: string;
    }
  | {
      decision: "legacy_only";
      cta: SocialMediaDownloadCta;
      reason: string;
      legacyCompatible: true;
    }
  | {
      decision: "unsupported_representation";
      cta: SocialMediaDownloadCta;
      artifactId?: string;
      artifactVersion?: number;
      artifactKey?: string;
      format?: string;
      reason: string;
      silentLegacyFallbackForbidden: true;
    }
  | {
      decision: "no_canonical_artifact";
      cta: SocialMediaDownloadCta;
      reason: string;
      /** Canonical CDF download cannot fall back to art_*. */
      silentLegacyFallbackForbidden: true;
      legacyCompatible?: false;
    }
  | {
      decision: "lifecycle_blocked";
      cta: SocialMediaDownloadCta;
      artifactId?: string;
      artifactVersion?: number;
      artifactKey?: string;
      reason: string;
      /** Final download requires approved — do not fall back to art_* as canonical. */
      silentLegacyFallbackForbidden: true;
    }
  | {
      decision: "not_a_download";
      cta: "create_another_size" | "request_adaptation";
      reason: string;
    };

export function classifySocialMediaDownloadCta(
  label: string,
): SocialMediaDownloadCta {
  const key = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (key === "download" || key === "download creative") return "download";
  if (key === "create another size") return "create_another_size";
  if (key === "request adaptation") return "request_adaptation";
  return "other";
}

export type SocialMediaCanonicalPin = {
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  validationStatus?: string;
  runtimePath?: string;
  canonicalRejected?: boolean;
  fallbackReason?: string;
  preferLegacyDownload?: boolean;
  /** ArtifactVersion.status when known — final requires approved. */
  lifecycleStatus?: string;
};

/**
 * Decide whether a Social Media CTA may use canonical RenderedFile.
 * Confirmed representations only: png/jpg for social-media.output.
 */
export function evaluateSocialMediaDownloadEligibility(input: {
  label: string;
  format?: string | null;
  pin?: SocialMediaCanonicalPin | null;
  canonicalDownloadEnabled?: boolean;
  /** Default true for final download CTAs. */
  requireApproved?: boolean;
}): SocialMediaDownloadEligibility {
  const cta = classifySocialMediaDownloadCta(input.label);

  if (cta === "create_another_size") {
    return {
      decision: "not_a_download",
      cta: "create_another_size",
      reason:
        "Create Another Size is a Social Media adaptation action (start_adaptation), not a representation",
    };
  }

  if (cta === "request_adaptation") {
    return {
      decision: "not_a_download",
      cta: "request_adaptation",
      reason:
        "Request Adaptation is a Social Media adaptation action (start_adaptation), not a representation",
    };
  }

  if (cta === "other") {
    return {
      decision: "legacy_only",
      cta,
      reason: "Non-Social-Media or unrecognized CTA — preserve legacy path",
      legacyCompatible: true,
    };
  }

  const enabled =
    input.canonicalDownloadEnabled ?? isSocialMediaCanonicalDownloadEnabled();
  if (!enabled) {
    return {
      decision: "unsupported_representation",
      cta,
      reason:
        "Canonical Social Media download required — art_* fallback eradicated",
      silentLegacyFallbackForbidden: true,
    };
  }

  const pin = input.pin;
  if (!pin?.artifactId?.startsWith("cdfart_")) {
    return {
      decision: "no_canonical_artifact",
      cta,
      reason:
        "No canonical Social Media ArtifactVersion pin — refusing art_* fallback",
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
      reason:
        "Canonical pin missing exact artifactVersion — refusing latest/legacy fallback",
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
      reason:
        "Canonical Social Media artifact was rejected — do not use art_* silently",
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

  if (
    !isSocialMediaArtifactKey(pin.artifactKey) ||
    pin.artifactKey !== SOCIAL_MEDIA_ARTIFACT_KEYS.output
  ) {
    return {
      decision: "unsupported_representation",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: `Artifact key ${pin.artifactKey} has no Social Media raster renderer`,
      silentLegacyFallbackForbidden: true,
    };
  }

  const requireApproved = input.requireApproved !== false;
  const life = pin.lifecycleStatus?.trim().toLowerCase();
  // M9C: generated/selected/validated-only cannot be final. Superseded+historically
  // approved is deferred to M5 lifecycle gate (same as Packaging/Presentation).
  const nonFinalStatuses = new Set([
    "draft",
    "candidate",
    "validated",
    "selected",
    "rejected",
  ]);
  if (requireApproved && life && nonFinalStatuses.has(life)) {
    return {
      decision: "lifecycle_blocked",
      cta,
      artifactId: pin.artifactId,
      artifactVersion: pin.artifactVersion,
      artifactKey: pin.artifactKey,
      reason: `Final Social Media download requires approved ArtifactVersion (status=${life}) — generated/selected-only not eligible`,
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
      reason: `Format ${formatRaw} is not a confirmed Social Media representation (png/jpg only)`,
      silentLegacyFallbackForbidden: true,
    };
  }

  return {
    decision: "canonical_capable",
    artifactId: pin.artifactId,
    artifactVersion: pin.artifactVersion,
    artifactKey: pin.artifactKey as SocialMediaArtifactKey,
    format,
    purpose: "final",
    cta,
    reason: `Canonical Social Media download via social-media-preview-raster (${format})`,
  };
}
