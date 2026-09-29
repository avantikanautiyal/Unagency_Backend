/**
 * M9E — Social Media representation contract (evidence-based).
 */

import { SOCIAL_MEDIA_ARTIFACT_KEYS } from "../../artifacts/social-media/keys";

export const SOCIAL_MEDIA_CONFIRMED_REPRESENTATIONS = [
  {
    format: "png" as const,
    mimeType: "image/png",
    purpose: "preview" as const,
    evidence: "Live social creative is raster; getMedia default image/png",
    canonicalSource: "previewAssetRef.vaultAssetId",
    rendererId: "social-media-preview-raster",
    status: "implemented" as const,
  },
  {
    format: "png" as const,
    mimeType: "image/png",
    purpose: "final" as const,
    evidence: "Same Vault raster; M5 lifecycle requires approved for final",
    canonicalSource: "previewAssetRef.vaultAssetId",
    rendererId: "social-media-preview-raster",
    status: "implemented" as const,
  },
  {
    format: "jpg" as const,
    mimeType: "image/jpeg",
    purpose: "preview" as const,
    evidence: "JPEG magic pass-through when Vault bytes are JPEG",
    canonicalSource: "previewAssetRef.vaultAssetId",
    rendererId: "social-media-preview-raster",
    status: "implemented" as const,
  },
] as const;

export const SOCIAL_MEDIA_UNRESOLVED_REPRESENTATIONS = [
  {
    format: "gif",
    reason: "No Social Media GIF / multi-frame CDF representation",
  },
  {
    format: "mp4",
    reason: "Video / reel not in Social Media CDF phase graph",
  },
  {
    format: "carousel",
    reason: "Carousel not a CDF artifact; multiAssetUnresolved",
  },
  {
    format: "pdf",
    reason: "No Social Media PDF production renderer; layout unresolved",
  },
  {
    format: "svg",
    reason: "On-image element layout unresolved — no vector compositor",
  },
  {
    format: "caption",
    reason: "Native caption/hashtags outside social-media.output (captionUnresolved)",
  },
] as const;

export const SOCIAL_MEDIA_RENDER_CONTRACT = {
  contractId: "unagency.social_media.render.v1",
  rendererId: "social-media-preview-raster",
  rendererVersion: "1.0.0",
  artifactKeys: [SOCIAL_MEDIA_ARTIFACT_KEYS.output],
  formats: ["png", "jpg"] as const,
  purposes: ["preview", "final"] as const,
  representationIsNotSoT: true,
  exactVersionRequired: true,
  neverLatest: true,
  neverMutatesArtifact: true,
  neverMutatesSession: true,
  neverCallsAi: true,
  neverInventLayout: true,
  neverSilentLegacyFallback: true,
  /** Canonical download is default for CDF Social Media Final. */
  liveTrafficMigrated: true,
  stranglerFlags: {
    ingest: "CDF_SOCIAL_MEDIA_INGEST",
  },
  finalActionMapping: {
    download: {
      current:
        "Canonical RenderedFile png from exact social-media.output ArtifactVersion — never art_* fallback",
      canonical:
        "Exact social-media.output artifactId@version → social-media-preview-raster → RenderedFile",
      status: "canonical_default",
    },
    create_another_size: {
      current: "start_adaptation workflow — not a representation",
      canonicalFuture: "CDF action, not a renderer",
      status: "not_a_renderer",
    },
    request_adaptation: {
      current: "start_adaptation workflow — not a representation",
      canonicalFuture: "CDF action, not a renderer",
      status: "not_a_renderer",
    },
  },
  unresolvedVisualLayout: "elementLayoutUnresolved — on-image boxes not invented",
  previewMigration: "legacy — chat preview remains art_*/getMedia; Final download is canonical",
} as const;
