/**
 * Legacy export path audit (M5) — classification only; do not delete legacy.
 */

export type CdfExportPathClass =
  | "A_canonical_renderer_ready"
  | "B_legacy_renderer"
  | "C_generation_on_export"
  | "D_direct_file_export"
  | "E_out_of_scope";

export type CdfLegacyExportAuditEntry = {
  path: string;
  classification: CdfExportPathClass;
  notes: string;
};

export const CDF_M5_LEGACY_EXPORT_AUDIT: readonly CdfLegacyExportAuditEntry[] = [
  {
    path: "cdf/artifacts/presentation (DeckSpec + supportedRepresentations)",
    classification: "A_canonical_renderer_ready",
    notes: "Canonical input for M5/M5B; no renderer yet for pptx/pdf.",
  },
  {
    path: "cdf/generation-artifact adapters (deck normalize)",
    classification: "A_canonical_renderer_ready",
    notes: "Produces DeckSpec only; explicitly does not render files.",
  },
  {
    path: "os/delivery/document-export-service (PptxGenJS / PDFKit)",
    classification: "B_legacy_renderer",
    notes: "Renders PresentationPlan slides — not M3B DeckSpec.",
  },
  {
    path: "api/services/document-export-materializer",
    classification: "C_generation_on_export",
    notes: "Materializes pdf/pptx art_* after structured generation; may best-effort image.generate.",
  },
  {
    path: "providers/tools/structured/structured-output-execution expandPresentationConceptsToRoutes",
    classification: "C_generation_on_export",
    notes: "May expand incomplete decks before export.",
  },
  {
    path: "os/delivery/best-effort-visual-image",
    classification: "C_generation_on_export",
    notes: "AI image generation during export — forbidden in M5 renderers.",
  },
  {
    path: "media/delivery/media-delivery-service ?format= + raster-pdf-export",
    classification: "D_direct_file_export",
    notes: "Converts existing blobs; not deck→representation.",
  },
  {
    path: "website-export-materializer / Brand Vault FE persist",
    classification: "E_out_of_scope",
    notes: "Adjacent download/vault promotion patterns.",
  },
  {
    path: "cdf/generation-validation (M4)",
    classification: "E_out_of_scope",
    notes: "Validates requirements; does not render.",
  },
] as const;
