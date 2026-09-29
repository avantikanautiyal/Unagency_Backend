/**
 * CDF 2.0 Social Media runtime
 * - M9B: generation → ArtifactVersion (opt-in ingest; no session mutation)
 * - M9C: ArtifactVersion → session generated/selected/approved (exact pins)
 * - M9F: download strangler (opt-in; default legacy art_* / getMedia)
 * Live Social Media traffic remains legacy by default.
 */

export {
  tryIngestSocialMediaCdfCompletion,
  resolveSocialMediaRefsFromSession,
  isSocialMediaCanonicalIngestEnabled,
  CDF_SOCIAL_MEDIA_RUNTIME_VERSION,
  type SocialMediaCanonicalAttach,
  type SocialMediaIngestFailure,
  type TryIngestSocialMediaResult,
} from "./ingest-bridge";
export {
  bindGeneratedSocialMediaArtifactToSession,
  findSocialMediaExactRef,
  sessionHasSocialMediaCanonicalRefs,
  socialMediaDependencySatisfied,
  SOCIAL_MEDIA_SELECT_ONLY_PHASES,
  type SocialMediaExactRefRequirement,
  type BindSocialMediaGeneratedSessionResult,
} from "./session-bind";
export {
  bindSocialMediaGeneratedFromAttach,
  type BindSocialMediaGeneratedResult,
} from "./session-integration";
export {
  evaluateSocialMediaDownloadEligibility,
  classifySocialMediaDownloadCta,
  isSocialMediaCanonicalDownloadEnabled,
  CDF_SOCIAL_MEDIA_DOWNLOAD_RUNTIME_VERSION,
  type SocialMediaDownloadCta,
  type SocialMediaDownloadEligibility,
  type SocialMediaCanonicalPin,
} from "./download-eligibility";
export {
  resolveSocialMediaCanonicalDownload,
  type ResolveSocialMediaCanonicalDownloadInput,
  type ResolveSocialMediaCanonicalDownloadResult,
} from "./canonical-download";
