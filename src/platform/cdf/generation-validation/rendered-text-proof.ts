/**
 * Rendered-text proof producer boundary.
 *
 * Default: null producer (no proof). Production OCR plugs in via
 * setRenderedTextProofProducer — do not invent parallel paths.
 *
 * Outcome semantics (Phase 14):
 * - ok + text → verified presence
 * - ok + empty text → verified absence (affirmative negative)
 * - artifact_unavailable / producer_unavailable / error → not verified;
 *   structural layer treats as UNVERIFIABLE (not content NON_COMPLIANT)
 * - null return → producer unavailable / no attempt (legacy)
 */

export type RenderedTextProofOutcome =
  | "ok"
  | "artifact_unavailable"
  | "producer_unavailable"
  | "error";

export type RenderedTextProof = {
  readonly extractedText?: string | null;
  readonly source?: "ocr" | "vision" | "none";
  /**
   * Producer attempt result. Omit only for legacy fixtures that imply success
   * via source === "ocr"|"vision".
   */
  readonly outcome?: RenderedTextProofOutcome;
  /** Optional OCR mean confidence in [0,1] when the engine provides it. */
  readonly confidence?: number;
  readonly language?: string;
  /** Non-sensitive diagnostic reason for non-ok outcomes. */
  readonly failureReason?: string;
};

export type RenderedTextProofArtifactRef = {
  readonly vaultAssetId?: string;
  readonly mimeType?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
};

export type RenderedTextProofProducer = (input: {
  readonly artifactRef?: RenderedTextProofArtifactRef;
}) => Promise<RenderedTextProof | null> | RenderedTextProof | null;

/** Default producer — explicit absence of pixel text proof. */
export const nullRenderedTextProofProducer: RenderedTextProofProducer =
  () => null;

let activeProducer: RenderedTextProofProducer = nullRenderedTextProofProducer;

/** Test / production wiring — replace the active producer. */
export function setRenderedTextProofProducer(
  producer: RenderedTextProofProducer | null,
): void {
  activeProducer = producer ?? nullRenderedTextProofProducer;
}

export function getRenderedTextProofProducer(): RenderedTextProofProducer {
  return activeProducer;
}

export async function produceRenderedTextProof(input: {
  readonly artifactRef?: RenderedTextProofArtifactRef;
}): Promise<RenderedTextProof | null> {
  try {
    return await activeProducer(input);
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 200) : "producer_threw";
    return {
      extractedText: null,
      source: "ocr",
      outcome: "error",
      failureReason: message,
    };
  }
}

/** True when proof represents a successful OCR/vision analysis (text may be empty). */
export function isSuccessfulRenderedTextProof(
  proof: RenderedTextProof | null | undefined,
): boolean {
  if (!proof) return false;
  if (proof.outcome === "ok") return true;
  if (
    proof.outcome === "artifact_unavailable" ||
    proof.outcome === "producer_unavailable" ||
    proof.outcome === "error"
  ) {
    return false;
  }
  // Legacy: source ocr/vision without outcome ⇒ treat as successful analysis.
  return proof.source === "ocr" || proof.source === "vision";
}
