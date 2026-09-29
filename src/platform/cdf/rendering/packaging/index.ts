/**
 * M8E — Packaging renderers registration (shared M5 RendererRegistry).
 */

import { registerRenderer } from "../registry";
import {
  createPackagingPreviewRasterRenderer,
  PACKAGING_PREVIEW_RASTER_RENDERER_ID,
  PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
} from "./preview-raster-renderer";

export {
  collectPackagingPreviewVaultIds,
  selectPackagingPreviewVaultId,
} from "./asset-collect";
export { assertPackagingUpstreamExactRefs } from "./upstream";
export {
  createPackagingPreviewRasterRenderer,
  packagingUnsupportedFormatMessage,
  PACKAGING_PREVIEW_RASTER_RENDERER_ID,
  PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
} from "./preview-raster-renderer";
export {
  PACKAGING_RENDER_CONTRACT,
  PACKAGING_CONFIRMED_REPRESENTATIONS,
  PACKAGING_UNRESOLVED_REPRESENTATIONS,
} from "../contracts/packaging";

let registered = false;

export function registerPackagingRenderers(): void {
  if (registered) return;
  registerRenderer(createPackagingPreviewRasterRenderer());
  registered = true;
}

export function resetPackagingRendererRegistrationForTests(): void {
  registered = false;
}
