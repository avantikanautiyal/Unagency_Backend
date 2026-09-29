/**
 * CDF 2.0 M5/M5B — Renderer architecture + Presentation PPTX/PDF.
 *
 * Canonical Artifact Version → RenderRequest → Registry → Renderer → Storage → RenderedFile
 *
 * Rendering never calls AI and never mutates artifacts.
 */

export * from "./types";
export * from "./errors";
export {
  createCdfRenderedFileId,
  isCdfRenderedFileId,
  assertRenderedFileIdBoundaries,
  assertRenderTargetArtifactId,
  sha256Hex,
  buildTenantRenderStorageKey,
  resetCdfRenderedFileIdsForTests,
} from "./ids";
export { hashRenderOptions, computeRenderKey } from "./hash";
export {
  assertLifecycleAllowsRender,
  allowedStatusesForPurpose,
  isVersionRenderable,
  CDF_RENDER_LIFECYCLE_POLICY,
} from "./lifecycle-gate";
export {
  registerRenderer,
  unregisterRenderer,
  listRegisteredRenderers,
  getRenderer,
  resolveRenderer,
  hasRendererCapability,
  resetCdfRendererRegistryForTests,
} from "./registry";
export {
  putRenderedBlob,
  getRenderedBlob,
  getRenderedBlobAsync,
  saveRenderedFile,
  getRenderedFile,
  getRenderedFileByRenderKey,
  listRenderedFilesForArtifact,
  resetCdfRenderedFileStoreForTests,
} from "./storage";
export {
  setCdfRenderedBlobStorage,
  getCdfRenderedBlobStorage,
} from "./blob-backend";
export {
  collectVaultAssetIdsFromDeckData,
  resolveAssetsForRender,
  createMemoryVaultAssetResolver,
  type VaultAssetResolver,
} from "./asset-resolver";
export {
  createMediaFileVaultAssetResolver,
  type MediaFileVaultAssetResolverOptions,
} from "./media-file-vault-asset-resolver";
export {
  setDefaultVaultAssetResolver,
  getDefaultVaultAssetResolver,
  resetDefaultVaultAssetResolverForTests,
} from "./default-vault-asset-resolver";
export { normalizeRenderOptions } from "./options";
export { renderArtifact, type RenderArtifactDeps } from "./service";
export {
  PRESENTATION_DECK_RENDER_CONTRACT,
  PRESENTATION_DECK_ARTIFACT_KEY,
  CDF_RENDER_EXTERNAL_RESOURCE_POLICY,
} from "./contracts/presentation-deck";
export {
  createPresentationDeckFixtureRenderer,
  FIXTURE_DECK_RENDERER_ID,
  FIXTURE_DECK_RENDERER_VERSION,
} from "./fixtures/test-renderer";
export {
  CDF_M5_LEGACY_EXPORT_AUDIT,
  type CdfExportPathClass,
  type CdfLegacyExportAuditEntry,
} from "./legacy-audit";
export {
  registerPresentationDeckRenderers,
  resetPresentationDeckRendererRegistrationForTests,
  createPresentationDeckPptxRenderer,
  createPresentationDeckPdfRenderer,
  PPTX_RENDERER_ID,
  PPTX_RENDERER_VERSION,
  PDF_RENDERER_ID,
  PDF_RENDERER_VERSION,
  buildCanonicalDeckRenderModel,
  resolveFont,
  slideSizeInches,
  slideSizePoints,
} from "./presentation";
export {
  extractPptxSlideTexts,
  extractPdfLiteralTexts,
  assertPptxContainsText,
  assertPdfContainsText,
} from "./presentation/inspect";
export {
  registerPackagingRenderers,
  resetPackagingRendererRegistrationForTests,
  createPackagingPreviewRasterRenderer,
  collectPackagingPreviewVaultIds,
  selectPackagingPreviewVaultId,
  assertPackagingUpstreamExactRefs,
  packagingUnsupportedFormatMessage,
  PACKAGING_PREVIEW_RASTER_RENDERER_ID,
  PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
  PACKAGING_RENDER_CONTRACT,
  PACKAGING_CONFIRMED_REPRESENTATIONS,
  PACKAGING_UNRESOLVED_REPRESENTATIONS,
} from "./packaging";
export {
  registerSocialMediaRenderers,
  resetSocialMediaRendererRegistrationForTests,
  createSocialMediaPreviewRasterRenderer,
  collectSocialMediaPreviewVaultIds,
  selectSocialMediaPreviewVaultId,
  assertSocialMediaUpstreamExactRefs,
  socialMediaUnsupportedFormatMessage,
  readPngDimensions,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
  SOCIAL_MEDIA_RENDER_CONTRACT,
  SOCIAL_MEDIA_CONFIRMED_REPRESENTATIONS,
  SOCIAL_MEDIA_UNRESOLVED_REPRESENTATIONS,
} from "./social-media";
export {
  registerStructuredDocumentRenderers,
  resetStructuredDocumentRendererRegistrationForTests,
  createStructuredDocumentPdfRenderer,
  STRUCTURED_DOCUMENT_PDF_RENDERER_ID,
  STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION,
} from "./structured-document";
export {
  httpRenderArtifact,
  httpGetRenderedFile,
  httpGetRenderedFileBytes,
  CDF_RENDER_FE_COMPAT,
} from "./http";

import { resetCdfRenderedFileIdsForTests } from "./ids";
import { resetCdfRendererRegistryForTests, registerRenderer } from "./registry";
import { resetCdfRenderedFileStoreForTests } from "./storage";
import { setCdfRenderedBlobStorage } from "./blob-backend";
import { resetDefaultVaultAssetResolverForTests } from "./default-vault-asset-resolver";
import { createPresentationDeckFixtureRenderer } from "./fixtures/test-renderer";
import {
  registerPresentationDeckRenderers,
  resetPresentationDeckRendererRegistrationForTests,
} from "./presentation";
import {
  registerPackagingRenderers,
  resetPackagingRendererRegistrationForTests,
} from "./packaging";
import {
  registerStructuredDocumentRenderers,
  resetStructuredDocumentRendererRegistrationForTests,
} from "./structured-document";
import {
  registerSocialMediaRenderers,
  resetSocialMediaRendererRegistrationForTests,
} from "./social-media";

/** Reset all M5/M5B/M8E/M9E in-memory state and re-register renderers for tests. */
export function resetCdfRenderingForTests(opts?: {
  registerFixtureRenderer?: boolean;
  registerPresentationRenderers?: boolean;
  registerPackagingRenderers?: boolean;
  registerSocialMediaRenderers?: boolean;
  registerStructuredDocumentRenderers?: boolean;
}): void {
  resetCdfRenderedFileIdsForTests();
  resetCdfRendererRegistryForTests();
  resetCdfRenderedFileStoreForTests();
  setCdfRenderedBlobStorage(null);
  resetDefaultVaultAssetResolverForTests();
  resetPresentationDeckRendererRegistrationForTests();
  resetPackagingRendererRegistrationForTests();
  resetSocialMediaRendererRegistrationForTests();
  resetStructuredDocumentRendererRegistrationForTests();
  if (opts?.registerFixtureRenderer !== false) {
    registerRenderer(createPresentationDeckFixtureRenderer());
  }
  if (opts?.registerPresentationRenderers !== false) {
    registerPresentationDeckRenderers();
  }
  if (opts?.registerPackagingRenderers !== false) {
    registerPackagingRenderers();
  }
  if (opts?.registerSocialMediaRenderers !== false) {
    registerSocialMediaRenderers();
  }
  if (opts?.registerStructuredDocumentRenderers !== false) {
    registerStructuredDocumentRenderers();
  }
}

// Auto-register Presentation PPTX/PDF (M5B) + Packaging raster (M8E) + Social Media raster (M9E)
// + generic structured-document PDF (registry-declared representation driven).
registerPresentationDeckRenderers();
registerPackagingRenderers();
registerSocialMediaRenderers();
registerStructuredDocumentRenderers();
