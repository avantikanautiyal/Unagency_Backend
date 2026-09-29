/**
 * Presentation deck render contract (M5/M5B).
 */

import { PRESENTATION_ARTIFACT_KEYS } from "../../artifacts/presentation/keys";
import type { PresentationDeckRenderContract } from "../types";

export const PRESENTATION_DECK_RENDER_CONTRACT: PresentationDeckRenderContract = {
  artifactKey: "presentation.deck",
  schemaVersion: "1",
  consumes: ["DeckSpec", "DesignSystem(exact version)", "VaultAssets"],
  doesNotConsume: [
    "RequirementEngine",
    "ContextResolver",
    "ActiveBrief",
    "AI providers",
  ],
  formats: ["preview", "pptx", "pdf"],
  implementationStatus: {
    preview: "contract_only",
    pptx: "implemented_m5b",
    pdf: "implemented_m5b",
    fixture: "available_for_tests",
  },
};

export const PRESENTATION_DECK_ARTIFACT_KEY =
  PRESENTATION_ARTIFACT_KEYS.deck;

/**
 * Font / external resource policy (M5B).
 *
 * - DesignSystem.fontRoles carry family names (not binary paths).
 * - PDF uses PDFKit standard fonts via an explicit safe-fallback map (logged).
 * - PPTX sets fontFace to the DesignSystem family name (host may substitute at view time).
 * - Silent material substitution of unmapped families is forbidden under strictFonts.
 * - Images/icons must resolve via VaultAssetResolver — never omit required assets.
 */
export const CDF_RENDER_EXTERNAL_RESOURCE_POLICY = {
  fonts: {
    source: "design_system.fontRoles → font-resolver map",
    silentSubstitution: "forbidden_without_documented_fallback",
    unresolved: false,
    pdfEmbedding: "standard_fonts_only_m5b",
  },
  images: {
    source: "DeckSpec element.vaultAssetId → VaultAssetResolver",
    silentOmitRequired: "forbidden",
  },
  icons: {
    source: "Vault or design-system tokens",
    unresolved: true,
  },
} as const;
