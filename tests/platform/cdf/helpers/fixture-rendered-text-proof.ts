/**
 * Test-only rendered-text proof producer.
 * Installs synthetic OCR so integration paths can exercise canonical ingest
 * without a production OCR/vision provider. Not used in production code.
 */

import {
  setRenderedTextProofProducer,
  nullRenderedTextProofProducer,
  type RenderedTextProof,
} from "../../../../src/platform/cdf/generation-validation/rendered-text-proof";

const DEFAULT_FIXTURE_TEXT =
  "Hello — fixture on-asset message for verification tests";

export function installFixtureRenderedTextProofProducer(
  extractedText: string = DEFAULT_FIXTURE_TEXT,
): void {
  setRenderedTextProofProducer(
    (): RenderedTextProof => ({
      extractedText,
      source: "ocr",
    }),
  );
}

export function uninstallFixtureRenderedTextProofProducer(): void {
  setRenderedTextProofProducer(nullRenderedTextProofProducer);
}
