/**
 * CDF 2.0 M8B–M8F — Packaging generation boundary + runtime download strangler.
 * Opt-in only. Live Packaging traffic remains legacy by default.
 */

export {
  tryIngestPackagingCdfCompletion,
  resolvePackagingRefsFromSession,
  isPackagingCanonicalIngestEnabled,
  CDF_PACKAGING_RUNTIME_VERSION,
  type PackagingCanonicalAttach,
  type PackagingIngestFailure,
  type TryIngestPackagingResult,
} from "./ingest-bridge";
export {
  bindGeneratedPackagingArtifactToSession,
  findPackagingExactRef,
  sessionHasPackagingCanonicalRefs,
  packagingDependencySatisfied,
} from "./session-bind";
export {
  evaluatePackagingDownloadEligibility,
  classifyPackagingDownloadCta,
  isPackagingCanonicalDownloadEnabled,
  PACKAGING_CTA_PREFERRED_KEYS,
  CDF_PACKAGING_DOWNLOAD_RUNTIME_VERSION,
  type PackagingDownloadCta,
  type PackagingDownloadEligibility,
  type PackagingCanonicalPin,
} from "./download-eligibility";
export {
  resolvePackagingCanonicalDownload,
  type ResolvePackagingCanonicalDownloadInput,
  type ResolvePackagingCanonicalDownloadResult,
} from "./canonical-download";
