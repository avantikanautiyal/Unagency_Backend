/**
 * CDF 2.0 M7 — Presentation runtime strangler boundary.
 */

export {
  tryIngestPresentationCdfCompletion,
  shouldSkipLegacyPresentationExport,
  CDF_PRESENTATION_RUNTIME_VERSION,
  type PresentationCanonicalAttach,
  type PresentationIngestFailure,
  type TryIngestPresentationResult,
  type LegacyFallbackReason,
} from "./ingest-bridge";

export {
  deriveDesignSystemFromRoute,
} from "./derive-design-system";

export {
  ensureDesignSystemOnSelect,
  type EnsureDesignSystemOnSelectInput,
  type EnsureDesignSystemOnSelectResult,
} from "./ensure-design-system-on-select";
