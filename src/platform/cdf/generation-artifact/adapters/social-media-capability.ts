/**
 * M9B — Classify Social Media provider envelopes before normalization.
 * Reality-based: live Social Media is prose routes + art_* raster output.
 */

import { isRecord, parseJsonIfString } from "../parse";
import type { SocialMediaArtifactKey } from "../../artifacts/social-media/keys";
import { socialMediaSchemaId } from "../../artifacts/social-media/keys";

export type SocialMediaProviderCapability =
  | "canonical_capable"
  | "structured_incomplete"
  | "raster_image_only"
  | "url_only"
  | "prose_only"
  | "legacy_execution_envelope"
  | "legacy_media_only"
  | "mixed_structured_plus_asset"
  | "unknown";

const IMAGE_KEYS = new Set([
  "url",
  "imageUrl",
  "image_url",
  "mediaUrl",
  "previewUrl",
  "src",
  "image",
]);

const MEDIA_KEYS = new Set(["mediaId", "artId", "artifactId", "artifactIds"]);

function looksLikeUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

function hasAnyKey(obj: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(obj).some((k) => keys.has(k));
}

function hasVaultPreviewSeed(parsed: Record<string, unknown>): boolean {
  const ref = parsed.previewAssetRef;
  if (!isRecord(ref)) return false;
  return typeof ref.vaultAssetId === "string" && ref.vaultAssetId.trim().length > 0;
}

/**
 * Classify raw provider/runtime output for a Social Media artifact key.
 * Does not invent structure.
 */
export function classifySocialMediaProviderOutput(
  artifactKey: SocialMediaArtifactKey,
  raw: unknown,
): SocialMediaProviderCapability {
  const parsed = parseJsonIfString(raw);

  if (typeof parsed === "string") {
    if (looksLikeUrl(parsed)) return "url_only";
    return "prose_only";
  }

  if (!isRecord(parsed)) return "unknown";

  const schemaExpected = socialMediaSchemaId(artifactKey);
  if (parsed.schemaId === schemaExpected) {
    return hasAnyKey(parsed, IMAGE_KEYS) || parsed.previewAssetRef != null
      ? "mixed_structured_plus_asset"
      : "canonical_capable";
  }

  // Generic Vault-backed media seed (from canonical media bridge) — family
  // adapters enrich/validate; do not reject for missing legacy raw-output shape.
  if (
    artifactKey === "social-media.output" &&
    hasVaultPreviewSeed(parsed)
  ) {
    return "mixed_structured_plus_asset";
  }

  if (
    parsed.kind === "artifact" ||
    (isRecord(parsed.data) && Array.isArray(parsed.data.artifactIds)) ||
    Array.isArray(parsed.artifactIds)
  ) {
    return "legacy_execution_envelope";
  }

  if (
    typeof parsed.mediaId === "string" &&
    String(parsed.mediaId).startsWith("art_")
  ) {
    return "legacy_media_only";
  }
  if (
    typeof parsed.artifactId === "string" &&
    String(parsed.artifactId).startsWith("art_") &&
    Object.keys(parsed).every((k) =>
      ["artifactId", "mediaId", "imageUrl", "url", "executionId"].includes(k),
    )
  ) {
    return "legacy_media_only";
  }

  const keys = Object.keys(parsed).filter((k) => k !== "schemaId");
  if (
    keys.length === 1 &&
    (keys[0] === "url" || keys[0] === "imageUrl" || keys[0] === "mediaUrl") &&
    looksLikeUrl(parsed[keys[0]!])
  ) {
    return "url_only";
  }
  if (
    keys.length > 0 &&
    keys.every((k) => IMAGE_KEYS.has(k) || looksLikeUrl(parsed[k]))
  ) {
    return "url_only";
  }
  if (
    keys.length > 0 &&
    keys.every(
      (k) => IMAGE_KEYS.has(k) || MEDIA_KEYS.has(k) || k === "executionId",
    )
  ) {
    if (hasAnyKey(parsed, MEDIA_KEYS)) return "legacy_media_only";
    return "raster_image_only";
  }

  switch (artifactKey) {
    case "social-media.platform": {
      if (
        parsed.platform != null ||
        parsed.platformId != null ||
        parsed.choice != null ||
        parsed.label != null
      ) {
        return "canonical_capable";
      }
      return "structured_incomplete";
    }
    case "social-media.size-reference": {
      if (
        parsed.pathKind != null ||
        parsed.optionId != null ||
        parsed.choice != null ||
        parsed.label != null ||
        parsed.canvas != null
      ) {
        return "canonical_capable";
      }
      return "structured_incomplete";
    }
    case "social-media.routes": {
      if (Array.isArray(parsed.routes) || Array.isArray(parsed.directions)) {
        const list = (parsed.routes ?? parsed.directions) as unknown[];
        if (
          list.length > 0 &&
          list.every(
            (r) => isRecord(r) && (r.name || r.title || r.label),
          )
        ) {
          return "canonical_capable";
        }
        return "structured_incomplete";
      }
      if (typeof parsed.text === "string" || typeof parsed.content === "string") {
        return "prose_only";
      }
      return "structured_incomplete";
    }
    case "social-media.output": {
      if (
        parsed.creativeId ||
        parsed.compositionNotes ||
        parsed.onImageCopy ||
        parsed.routesRef
      ) {
        return parsed.previewAssetRef || hasAnyKey(parsed, IMAGE_KEYS)
          ? "mixed_structured_plus_asset"
          : "canonical_capable";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    default:
      return "unknown";
  }
}

export function isSocialMediaCanonicalCapable(
  capability: SocialMediaProviderCapability,
): boolean {
  return (
    capability === "canonical_capable" ||
    capability === "mixed_structured_plus_asset"
  );
}
