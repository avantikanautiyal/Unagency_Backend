/**
 * M8B — Classify Packaging provider envelopes before normalization.
 * Reality-based: live Packaging is mostly raster / prose; structured is rare.
 */

import { isRecord, parseJsonIfString } from "../parse";
import type { PackagingArtifactKey } from "../../artifacts/packaging/keys";
import { packagingSchemaId } from "../../artifacts/packaging/keys";

export type PackagingProviderCapability =
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
 * Classify raw provider/runtime output for a Packaging artifact key.
 * Does not invent structure — used for audits, gates, and typed failures.
 */
export function classifyPackagingProviderOutput(
  artifactKey: PackagingArtifactKey,
  raw: unknown,
): PackagingProviderCapability {
  const parsed = parseJsonIfString(raw);

  if (typeof parsed === "string") {
    if (looksLikeUrl(parsed)) return "url_only";
    return "prose_only";
  }

  if (!isRecord(parsed)) return "unknown";

  const schemaExpected = packagingSchemaId(artifactKey);
  if (parsed.schemaId === schemaExpected) {
    return hasAnyKey(parsed, IMAGE_KEYS) || parsed.previewAssetRef != null
      ? "mixed_structured_plus_asset"
      : "canonical_capable";
  }

  // Generic Vault-backed media seed (canonical media bridge) — adapters enrich.
  // packaging.3d-direction: seed may already carry candidates[] from the image
  // bridge; vault preview alone is also elevatable by the adapter.
  if (
    (artifactKey === "packaging.front-pack" ||
      artifactKey === "packaging.complete-pack" ||
      artifactKey === "packaging.views" ||
      artifactKey === "packaging.3d-direction") &&
    hasVaultPreviewSeed(parsed)
  ) {
    return "mixed_structured_plus_asset";
  }

  // Legacy Direct execution result shape
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
  if (keys.length > 0 && keys.every((k) => IMAGE_KEYS.has(k) || looksLikeUrl(parsed[k]))) {
    if (keys.every((k) => looksLikeUrl(parsed[k]) || k === "url" || k === "imageUrl" || k === "mediaUrl" || k === "previewUrl" || k === "src")) {
      const onlyUrls = keys.every((k) => looksLikeUrl(parsed[k]));
      if (onlyUrls || (keys.length === 1 && looksLikeUrl(parsed[keys[0]!]))) {
        return "url_only";
      }
    }
    return "raster_image_only";
  }
  if (keys.length > 0 && keys.every((k) => IMAGE_KEYS.has(k) || MEDIA_KEYS.has(k) || k === "executionId")) {
    if (hasAnyKey(parsed, MEDIA_KEYS)) return "legacy_media_only";
    return "raster_image_only";
  }
  if (keys.length === 1 && (keys[0] === "url" || keys[0] === "imageUrl")) {
    return looksLikeUrl(parsed[keys[0]!]) ? "url_only" : "raster_image_only";
  }

  switch (artifactKey) {
    case "packaging.dieline": {
      if (
        parsed.pathKind != null ||
        parsed.choice != null ||
        parsed.label != null ||
        Array.isArray(parsed.panels)
      ) {
        return "canonical_capable";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    case "packaging.routes": {
      if (Array.isArray(parsed.routes) || Array.isArray(parsed.directions)) {
        const list = (parsed.routes ?? parsed.directions) as unknown[];
        if (list.length > 0 && list.every((r) => isRecord(r) && (r.name || r.title || r.label))) {
          return "canonical_capable";
        }
        return "structured_incomplete";
      }
      if (typeof parsed.text === "string" || typeof parsed.content === "string") {
        return "prose_only";
      }
      return "structured_incomplete";
    }
    case "packaging.3d-direction": {
      if (Array.isArray(parsed.candidates) || Array.isArray(parsed.directions)) {
        const list = (parsed.candidates ?? parsed.directions) as unknown[];
        const ok = list.some(
          (c) =>
            isRecord(c) &&
            (c.visualIntent || c.description || c.intent) &&
            (c.name || c.title || c.label),
        );
        return ok ? "mixed_structured_plus_asset" : "structured_incomplete";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    case "packaging.front-pack": {
      if (parsed.frontId || parsed.compositionNotes || parsed.description) {
        return parsed.previewAssetRef || hasAnyKey(parsed, IMAGE_KEYS)
          ? "mixed_structured_plus_asset"
          : "canonical_capable";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    case "packaging.complete-pack": {
      if (Array.isArray(parsed.surfaces) && parsed.surfaces.length > 0) {
        return "canonical_capable";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    case "packaging.views": {
      if (Array.isArray(parsed.views) && parsed.views.length > 0) {
        return "canonical_capable";
      }
      if (hasAnyKey(parsed, IMAGE_KEYS) || hasAnyKey(parsed, MEDIA_KEYS)) {
        return "raster_image_only";
      }
      return "structured_incomplete";
    }
    case "packaging.sku-adaptations": {
      if (Array.isArray(parsed.skus) && parsed.skus.length > 0) {
        return "canonical_capable";
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

/** True when classification may proceed to packaging adapters. */
export function isPackagingCanonicalCapable(
  capability: PackagingProviderCapability,
): boolean {
  return (
    capability === "canonical_capable" ||
    capability === "mixed_structured_plus_asset"
  );
}
