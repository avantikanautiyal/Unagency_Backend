/**
 * M3C path audit — which Presentation / Packaging / Social Media generation paths
 * use the generation→artifact boundary.
 */

export type CdfM3cPathAuditStatus =
  | "m3c_boundary"
  | "legacy_explicit"
  | "out_of_scope"
  | "m7_wired"
  /** Social Media M9B classifications (evidence-based). */
  | "canonical-capable"
  | "canonicalized"
  | "canonicalization-unsupported"
  | "legacy-only"
  | "non-artifact";

export type CdfM3cPathAuditRow = {
  path: string;
  entry: string;
  adapter: string;
  artifactKey: string;
  status: CdfM3cPathAuditStatus;
  notes: string;
};

export const CDF_M3C_GENERATION_PATH_AUDIT: readonly CdfM3cPathAuditRow[] = [
  {
    path: "Storyline (CDF)",
    entry: "ingestGenerationCompletion (M4 pre-persist) via presentation-runtime",
    adapter: "normalizePresentationStoryline",
    artifactKey: "presentation.storyline",
    status: "m7_wired",
    notes:
      "Structured slides[] required. Prose-only Direct output fails M3C by design (no fake wrap).",
  },
  {
    path: "Slide content (CDF)",
    entry: "same as storyline",
    adapter: "normalizePresentationSlideContent",
    artifactKey: "presentation.slide-content",
    status: "m7_wired",
    notes: "Structured slide blocks required; M4 gate before persist.",
  },
  {
    path: "Design routes",
    entry: "select_route → ensureDesignSystemOnSelect may ingest route",
    adapter: "normalizePresentationDesignRoute",
    artifactKey: "presentation.design-route",
    status: "m7_wired",
    notes: "Candidates until explicit select_route. Selection ≠ approval.",
  },
  {
    path: "Design system",
    entry: "ensureDesignSystemOnSelect after design-routes select",
    adapter: "deriveDesignSystemFromRoute → normalizePresentationDesignSystem",
    artifactKey: "presentation.design-system",
    status: "m7_wired",
    notes:
      "Derived from selected route directions (exact derivedFromRoute). Bootstrap fixture forbidden.",
  },
  {
    path: "Full deck (Direct PresentationRoutes)",
    entry: "tryIngestPresentationCdfCompletion → ingestGenerationCompletion",
    adapter: "normalizePresentationDeck",
    artifactKey: "presentation.deck",
    status: "m7_wired",
    notes:
      "Requires exact designSystemRef from select. M4 pre-persist. Skip legacy materializer when accepted.",
  },
  {
    path: "Source",
    entry: "static source cards / brief refs",
    adapter: "normalizePresentationSource",
    artifactKey: "presentation.source",
    status: "m3c_boundary",
    notes: "References ActiveBrief; does not replace SourceInput.",
  },
  {
    path: "Document export PPTX/PDF",
    entry: "document-export-materializer",
    adapter: "none",
    artifactKey: "n/a",
    status: "legacy_explicit",
    notes:
      "LEGACY strangler (art_*). Canonical download uses M5B RenderedFile. FORCE_LEGACY_EXPORT kill-switch removed.",
  },
  {
    path: "Non-CDF Direct presentations create",
    entry: "POST /executions without cdfSessionId",
    adapter: "n/a unless ingest invoked",
    artifactKey: "presentation.deck",
    status: "legacy_explicit",
    notes: "Legacy-only path — no canonical attach.",
  },
  // ─── Packaging (M8B foundation — adapters exist; live traffic NOT migrated) ───
  {
    path: "Packaging dieline",
    entry: "tryIngestPackagingCdfCompletion (opt-in CDF_PACKAGING_INGEST)",
    adapter: "normalizePackagingDieline",
    artifactKey: "packaging.dieline",
    status: "out_of_scope",
    notes:
      "BOUNDARY READY. Live = config cards only. Geometry UNRESOLVED. Default ingest OFF.",
  },
  {
    path: "Packaging routes",
    entry: "tryIngestPackagingCdfCompletion (opt-in)",
    adapter: "normalizePackagingRoutes",
    artifactKey: "packaging.routes",
    status: "out_of_scope",
    notes:
      "BOUNDARY READY for structured routes[]. Live WRITE_COPY prose → CANONICAL REJECTED.",
  },
  {
    path: "Packaging 3d-direction",
    entry: "tryIngestPackagingCdfCompletion (opt-in)",
    adapter: "normalizePackaging3dDirection",
    artifactKey: "packaging.3d-direction",
    status: "out_of_scope",
    notes:
      "Live pack_3d → art_* RASTER ONLY → PACKAGING_CANONICALIZATION_UNSUPPORTED. Not structured 3D.",
  },
  {
    path: "Packaging front/complete/views/sku",
    entry: "tryIngestPackagingCdfCompletion (opt-in)",
    adapter: "normalizePackagingFrontPack|CompletePack|Views|SkuAdaptations",
    artifactKey: "packaging.*",
    status: "out_of_scope",
    notes:
      "BOUNDARY READY for structured candidates. Live raster → rejected. art_* downloads unchanged.",
  },
  // ─── Social Media (M9B — classified by live evidence + ingest gate) ───
  {
    path: "Social Media platform",
    entry: "tryIngestSocialMediaCdfCompletion (opt-in CDF_SOCIAL_MEDIA_INGEST)",
    adapter: "normalizeSocialMediaPlatform",
    artifactKey: "social-media.platform",
    status: "canonical-capable",
    notes:
      "When ingest ON and config is stamped (platform/label): creates ArtifactVersion. Live default = static cards, ingest OFF → legacy-only behavior. M9B does not write session refs.",
  },
  {
    path: "Social Media size-reference",
    entry: "tryIngestSocialMediaCdfCompletion (opt-in)",
    adapter: "normalizeSocialMediaSizeReference",
    artifactKey: "social-media.size-reference",
    status: "canonical-capable",
    notes:
      "When ingest ON and pathKind (+ canvas for enter_size) stamped: creates ArtifactVersion. Dimensions never invented. Default ingest OFF → legacy-only.",
  },
  {
    path: "Social Media routes",
    entry: "tryIngestSocialMediaCdfCompletion (opt-in)",
    adapter: "normalizeSocialMediaRoutes",
    artifactKey: "social-media.routes",
    status: "canonicalization-unsupported",
    notes:
      "Live WRITE_COPY prose → SOCIAL_CANONICALIZATION_UNSUPPORTED. Structured routes[3] can canonicalized when provided (test/fixture path). Default live = unsupported.",
  },
  {
    path: "Social Media output",
    entry: "tryIngestSocialMediaCdfCompletion (opt-in)",
    adapter: "normalizeSocialMediaOutput",
    artifactKey: "social-media.output",
    status: "canonicalization-unsupported",
    notes:
      "Live art_* + URL/raster → unsupported without structure + Vault ObjectId. Eligible structured+Vault payloads can canonicalized under ingest ON. No session mutation in M9B.",
  },
  {
    path: "Social Media final",
    entry: "tryIngestSocialMediaCdfCompletion",
    adapter: "n/a",
    artifactKey: "n/a",
    status: "non-artifact",
    notes:
      "final_no_artifact — download/adaptation CTAs only; no creative schema.",
  },
];

/**
 * Social Media-only view of the path audit (same rows, filtered).
 * Prefer this when documenting M9B classifications.
 */
export function listSocialMediaGenerationPathAudit(): CdfM3cPathAuditRow[] {
  return CDF_M3C_GENERATION_PATH_AUDIT.filter((r) =>
    r.path.startsWith("Social Media"),
  );
}
