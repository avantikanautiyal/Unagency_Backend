/**
 * Register the generic structured-document PDF renderer (M5).
 */

import { registerRenderer } from "../registry";
import { createStructuredDocumentPdfRenderer } from "./pdf-renderer";

let registered = false;

export function registerStructuredDocumentRenderers(): void {
  if (registered) return;
  registerRenderer(createStructuredDocumentPdfRenderer());
  registered = true;
}

export function resetStructuredDocumentRendererRegistrationForTests(): void {
  registered = false;
}

export {
  createStructuredDocumentPdfRenderer,
  STRUCTURED_DOCUMENT_PDF_RENDERER_ID,
  STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION,
} from "./pdf-renderer";
