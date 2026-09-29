/**
 * Presentation generation adapters (M3C) + Packaging adapters (M8A foundation).
 */

export { normalizePresentationSource } from "./source";
export { normalizePresentationStoryline } from "./storyline";
export { normalizePresentationSlideContent } from "./slide-content";
export {
  normalizePresentationDesignRoute,
  normalizePresentationDesignRoutes,
} from "./design-route";
export { normalizePresentationDesignSystem } from "./design-system";
export { normalizePresentationDeck } from "./deck";
export {
  normalizePackagingDieline,
  normalizePackagingRoutes,
  normalizePackaging3dDirection,
  normalizePackagingFrontPack,
  normalizePackagingCompletePack,
  normalizePackagingViews,
  normalizePackagingSkuAdaptations,
  normalizeToPackagingData,
  classifyPackagingProviderOutput,
  isPackagingCanonicalCapable,
} from "./packaging";
export type { PackagingProviderCapability } from "./packaging-capability";
export {
  normalizeSocialMediaPlatform,
  normalizeSocialMediaSizeReference,
  normalizeSocialMediaRoutes,
  normalizeSocialMediaOutput,
  normalizeToSocialMediaData,
  classifySocialMediaProviderOutput,
  isSocialMediaCanonicalCapable,
} from "./social-media";
export type { SocialMediaProviderCapability } from "./social-media-capability";
export { normalizeGenericCanonicalData } from "./generic";
