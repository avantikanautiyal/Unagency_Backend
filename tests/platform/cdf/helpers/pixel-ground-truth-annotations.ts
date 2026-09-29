/**
 * Phase 14.7 — HUMAN pixel ground-truth annotations for real creatives.
 *
 * These annotations are BENCHMARK EVIDENCE ONLY.
 * They are NOT runtime authority.
 * They were produced by inspecting actual image pixels — NOT from OCR output.
 */

export type PixelPresence = "PRESENT" | "ABSENT" | "UNCERTAIN";

export type PixelTextBlockAnnotation = {
  readonly expectedText: string;
  readonly pixelPresence: PixelPresence;
  readonly approximateLocation:
    | "top"
    | "center"
    | "bottom"
    | "left"
    | "right"
    | "full-width"
    | "unknown";
  readonly notes: string;
};

export type ObservedVisibleText = {
  readonly text: string;
  readonly approximateLocation: PixelTextBlockAnnotation["approximateLocation"];
  readonly notes: string;
};

export type PixelGroundTruthAnnotation = {
  readonly artifactId: string;
  readonly imageFile: string;
  readonly annotator: "human_pixel_inspection";
  readonly annotatedAt: string;
  /** Authoritative required texts (may be empty when GT unavailable). */
  readonly expectedBlocks: readonly PixelTextBlockAnnotation[];
  /** What is actually visibly rendered (independent of requirements). */
  readonly observedVisibleTexts: readonly ObservedVisibleText[];
  readonly overallExpectedPresence: PixelPresence | "N/A";
  readonly generationQualityNote: string;
};

/**
 * Human annotations for Phase 14.6 corpus images (excluding brand-logo reference).
 */
export const PIXEL_GROUND_TRUTH_ANNOTATIONS: readonly PixelGroundTruthAnnotation[] =
  Object.freeze([
    {
      artifactId: "real_01_phase8_sunflower_hello_sunshine",
      imageFile: "real_01_phase8_sunflower_hello_sunshine.png",
      annotator: "human_pixel_inspection",
      annotatedAt: "2026-09-14",
      expectedBlocks: Object.freeze([
        {
          expectedText:
            "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes:
            "Required intro communication is not on the canvas. Only a stylized 'Sunflower' wordmark banner is visible across the torso.",
        },
      ]),
      observedVisibleTexts: Object.freeze([
        {
          text: "Sunflower",
          approximateLocation: "center",
          notes:
            "Wordmark on white sticker-like banner; letter 'o' replaced by sunflower graphic (may confuse OCR).",
        },
      ]),
      overallExpectedPresence: "ABSENT",
      generationQualityNote:
        "GENERATION/RENDERING miss for required intro; brand wordmark only.",
    },
    {
      artifactId: "real_02_phase8_bloomsip_refreshment",
      imageFile: "real_02_phase8_bloomsip_refreshment.png",
      annotator: "human_pixel_inspection",
      annotatedAt: "2026-09-14",
      expectedBlocks: Object.freeze([
        {
          expectedText:
            "Transform your everyday refresh with real botanicals and sparkling sophistication—meet BloomSip.",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes: "BloomSip primary message not visible anywhere.",
        },
        {
          expectedText: "Refreshment, Refined. Botanicals, Reimagined.",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes: "Required headline not visible.",
        },
        {
          expectedText: "Premium ingredients. Pure refreshment. Purely you.",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes: "Required secondary not visible.",
        },
      ]),
      observedVisibleTexts: Object.freeze([
        {
          text: "Instagram",
          approximateLocation: "top",
          notes: "Phone UI chrome / app header script logo.",
        },
        {
          text: "03.27",
          approximateLocation: "top",
          notes: "Phone status-bar time.",
        },
        {
          text: "garbled caption resembling 'instagram creative about my brand'",
          approximateLocation: "bottom",
          notes:
            "Stylized nonsense/caption glyphs present but are NOT the BloomSip expected marketing copy.",
        },
      ]),
      overallExpectedPresence: "ABSENT",
      generationQualityNote:
        "GENERATION miss — image is an Instagram UI mock with unrelated/garbled caption, not BloomSip communication.",
    },
    {
      artifactId: "real_03_exec42_sunflower_metaphor",
      imageFile: "real_03_exec42_sunflower_metaphor.png",
      annotator: "human_pixel_inspection",
      annotatedAt: "2026-09-14",
      expectedBlocks: Object.freeze([
        {
          expectedText:
            "Sunflower nurtures every aspect of a child's development—helping them build strong foundations, grow confidently, and flourish in all areas of life.",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes: "Required primary message not on canvas.",
        },
        {
          expectedText: "Growing minds. Growing humans.",
          pixelPresence: "ABSENT",
          approximateLocation: "unknown",
          notes: "Tagline not on canvas.",
        },
      ]),
      observedVisibleTexts: Object.freeze([
        {
          text: "FORMAT",
          approximateLocation: "center",
          notes:
            "Large high-contrast word FORMAT only; small icons near the T. Completely unrelated to expected educational message.",
        },
      ]),
      overallExpectedPresence: "ABSENT",
      generationQualityNote:
        "GENERATION miss — canvas shows 'FORMAT', not required Sunflower communication.",
    },
    {
      artifactId: "real_04_exec43_sunny_introduction",
      imageFile: "real_04_exec43_sunny_introduction.png",
      annotator: "human_pixel_inspection",
      annotatedAt: "2026-09-14",
      expectedBlocks: Object.freeze([]),
      observedVisibleTexts: Object.freeze([
        {
          text: "Unagency",
          approximateLocation: "center",
          notes:
            "Only visible word. Authoritative expected on-asset message was unavailable (OR-headline alternatives only).",
        },
      ]),
      overallExpectedPresence: "N/A",
      generationQualityNote:
        "Cannot score generation adherence against expectedTexts (GROUND_TRUTH_UNAVAILABLE for requirements). Visible text is 'Unagency' only.",
    },
  ]);

export type DualDimensionClassification =
  | "OCR_TRUE_POSITIVE"
  | "OCR_FALSE_NEGATIVE"
  | "OCR_FALSE_POSITIVE"
  | "OCR_UNVERIFIABLE"
  | "GENERATION_ABSENCE_CONFIRMED"
  | "GENERATION_TEXT_PRESENT"
  | "GROUND_TRUTH_UNCERTAIN"
  | "MATCHER_FAILURE"
  | "REQUIREMENT_GT_UNAVAILABLE";

/**
 * Classify using BOTH pixel ground truth and OCR vs expected text.
 */
export function classifyDualDimension(input: {
  readonly pixelPresence: PixelPresence | "N/A";
  readonly ocrMessageMatch: boolean | null;
  readonly ocrExtractedNonEmpty: boolean;
  readonly ocrOutcomeOk: boolean;
}): DualDimensionClassification {
  if (input.pixelPresence === "N/A") return "REQUIREMENT_GT_UNAVAILABLE";
  if (input.pixelPresence === "UNCERTAIN") return "GROUND_TRUTH_UNCERTAIN";
  if (!input.ocrOutcomeOk) return "OCR_UNVERIFIABLE";

  if (input.pixelPresence === "ABSENT") {
    if (input.ocrMessageMatch === true) return "OCR_FALSE_POSITIVE";
    return "GENERATION_ABSENCE_CONFIRMED";
  }

  // pixel PRESENT
  if (input.ocrMessageMatch === true) return "OCR_TRUE_POSITIVE";
  if (input.ocrExtractedNonEmpty && input.ocrMessageMatch === false) {
    // Could be OCR miss or matcher — caller may refine with perfect OCR string check
    return "OCR_FALSE_NEGATIVE";
  }
  return "OCR_FALSE_NEGATIVE";
}
