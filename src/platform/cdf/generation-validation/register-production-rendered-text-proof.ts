/**
 * Register the production rendered-text OCR producer on the generic boundary.
 * Call once at platform boot after VaultAssetResolver is wired.
 */

import { createTesseractRenderedTextProofProducer } from "./ocr-tesseract-rendered-text-producer";
import {
  nullRenderedTextProofProducer,
  setRenderedTextProofProducer,
} from "./rendered-text-proof";
import {
  setVisualVerificationCapabilityClaim,
} from "./visual-verification-capabilities";

export type RegisterProductionRenderedTextProofOptions = {
  /** When false, leave producer/capability unchanged (tests / opt-out). Default true. */
  readonly enabled?: boolean;
  readonly language?: string;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
};

/**
 * Install tesseract.js OCR as the active RenderedTextProofProducer and mark
 * OCR_TEXT_RECOGNITION as declared (available). Claim upgrades to verified
 * only after evidence-backed integration tests — callers may pass claimOverride.
 */
export function registerProductionRenderedTextProofProducer(
  options: RegisterProductionRenderedTextProofOptions & {
    readonly claim?: "declared" | "verified";
  } = {},
): boolean {
  if (options.enabled === false) {
    return false;
  }

  const producer = createTesseractRenderedTextProofProducer({
    language: options.language,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs,
  });
  setRenderedTextProofProducer(producer);
  setVisualVerificationCapabilityClaim({
    capabilityId: "OCR_TEXT_RECOGNITION",
    claim: options.claim ?? "declared",
    notes:
      "tesseract.js OCR producer registered; resolves VaultAsset bytes via VaultAssetResolver",
  });
  return true;
}

export function unregisterProductionRenderedTextProofProducer(): void {
  setRenderedTextProofProducer(nullRenderedTextProofProducer);
  setVisualVerificationCapabilityClaim({
    capabilityId: "OCR_TEXT_RECOGNITION",
    claim: "undeclared",
    notes:
      "no classical OCR producer registered (knowledge.ocr remains a no-op hook)",
  });
}
