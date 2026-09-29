/**
 * Register Presentation PPTX/PDF renderers (M5B).
 */

import { registerRenderer } from "../registry";
import { createPresentationDeckPptxRenderer } from "./pptx-renderer";
import { createPresentationDeckPdfRenderer } from "./pdf-renderer";

let registered = false;

export function registerPresentationDeckRenderers(): void {
  if (registered) return;
  registerRenderer(createPresentationDeckPptxRenderer());
  registerRenderer(createPresentationDeckPdfRenderer());
  registered = true;
}

export function resetPresentationDeckRendererRegistrationForTests(): void {
  registered = false;
}

export {
  createPresentationDeckPptxRenderer,
  PPTX_RENDERER_ID,
  PPTX_RENDERER_VERSION,
} from "./pptx-renderer";
export {
  createPresentationDeckPdfRenderer,
  PDF_RENDERER_ID,
  PDF_RENDERER_VERSION,
} from "./pdf-renderer";
export { buildCanonicalDeckRenderModel } from "./model";
export {
  normalizedToPhysical,
  slideSizeInches,
  slideSizePoints,
  PPTX_BASE_WIDTH_IN,
  PDF_BASE_WIDTH_PT,
} from "./coords";
export { resolveFont } from "./fonts";
