/**
 * M8E — Packaging representation contract (evidence-based).
 */

import { PACKAGING_ARTIFACT_KEYS } from "../../artifacts/packaging/keys";

/** Formats confirmed by live Packaging product behavior + canonical schema support. */
export const PACKAGING_CONFIRMED_REPRESENTATIONS = [
  {
    format: "png" as const,
    mimeType: "image/png",
    evidence: "Live pack_3d/pack_flat → art_* raster; getMedia default image/png",
    canonicalSource: "previewAssetRef.vaultAssetId",
    rendererId: "packaging-preview-raster",
    status: "implemented" as const,
  },
  {
    format: "jpg" as const,
    mimeType: "image/jpeg",
    evidence: "downloadFormatsForKind includes jpg for image / image_3d_mockup",
    canonicalSource: "previewAssetRef.vaultAssetId",
    rendererId: "packaging-preview-raster",
    status: "implemented" as const,
  },
] as const;

/** Formats that must NOT be fabricated. */
export const PACKAGING_UNRESOLVED_REPRESENTATIONS = [
  {
    format: "svg",
    reason: "No Packaging SVG exporter; dieline cut/fold geometry unresolved",
  },
  {
    format: "pdf",
    reason:
      "No Packaging PDF production renderer; final CTAs do not request format=pdf",
  },
  {
    format: "glb",
    reason: "No GLB/scene graph in repository; 3D = photoreal raster only",
  },
  {
    format: "zip_kit",
    reason: "Multi-file packaging kit download not implemented",
  },
  {
    format: "cmyk_print",
    reason: "CMYK / print-ready production file set unresolved",
  },
] as const;

export const PACKAGING_RENDER_CONTRACT = {
  contractId: "unagency.packaging.render.v1",
  rendererId: "packaging-preview-raster",
  rendererVersion: "1.0.0",
  artifactKeys: [
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
    PACKAGING_ARTIFACT_KEYS.frontPack,
    PACKAGING_ARTIFACT_KEYS.completePack,
    PACKAGING_ARTIFACT_KEYS.views,
    PACKAGING_ARTIFACT_KEYS.skuAdaptations,
  ],
  formats: ["png", "jpg"] as const,
  purposes: ["preview", "final"] as const,
  representationIsNotSoT: true,
  exactVersionRequired: true,
  neverLatest: true,
  neverMutatesArtifact: true,
  neverCallsAi: true,
  neverFabricatesGeometry: true,
  neverFabricatesSceneGraph: true,
  neverSilentLegacyFallback: true,
  /** Canonical download is default for CDF Packaging Final. */
  liveTrafficMigrated: true,
  stranglerFlags: {
    ingest: "CDF_PACKAGING_INGEST",
  },
  finalActionMapping: {
    download_packaging_files: {
      current:
        "Canonical RenderedFile png from exact Packaging ArtifactVersion — never art_* fallback",
      canonical:
        "Exact artifactId@version → packaging-preview-raster → RenderedFile (single raster; not a ZIP kit)",
      unresolvedProductDecision:
        "CTA name implies multi-file kit — no confirmed multi-file Packaging representation yet",
      status: "canonical_default",
    },
    download_3d_mockups: {
      current:
        "Canonical RenderedFile from 3d-direction/views pin — never art_* fallback",
      canonical:
        "RenderedFile png/jpg from packaging.3d-direction / views — never GLB",
      status: "canonical_default",
    },
    create_another_sku: {
      current: "start_adaptation workflow — not a representation",
      canonicalFuture: "CDF action, not a renderer",
      status: "not_a_renderer",
    },
  },
} as const;
