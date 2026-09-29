/**
 * M9E — Social Media renderers registration (shared M5 RendererRegistry).
 */

import { registerRenderer } from "../registry";
import {
  createSocialMediaPreviewRasterRenderer,
} from "./preview-raster-renderer";

export {
  collectSocialMediaPreviewVaultIds,
  selectSocialMediaPreviewVaultId,
} from "./asset-collect";
export { assertSocialMediaUpstreamExactRefs } from "./upstream";
export {
  createSocialMediaPreviewRasterRenderer,
  socialMediaUnsupportedFormatMessage,
  readPngDimensions,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID,
  SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
} from "./preview-raster-renderer";
export {
  SOCIAL_MEDIA_RENDER_CONTRACT,
  SOCIAL_MEDIA_CONFIRMED_REPRESENTATIONS,
  SOCIAL_MEDIA_UNRESOLVED_REPRESENTATIONS,
} from "../contracts/social-media";

let registered = false;

export function registerSocialMediaRenderers(): void {
  if (registered) return;
  registerRenderer(createSocialMediaPreviewRasterRenderer());
  registered = true;
}

export function resetSocialMediaRendererRegistrationForTests(): void {
  registered = false;
}
