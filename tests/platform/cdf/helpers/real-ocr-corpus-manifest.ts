/**
 * Phase 14.6 — real creative artifact OCR corpus manifest.
 *
 * Ground truth comes from authoritative pre-generation route/composition data.
 * OCR output is NEVER used as ground truth.
 *
 * Images live under tmp-ocr-real-corpus/images/ (local evidence; not synthetic).
 * Provider/service fields are METADATA ONLY — never influence OCR.
 */

export type RealCorpusEntry = {
  readonly id: string;
  readonly imageFile: string;
  readonly sourcePathNote: string;
  readonly providerMeta: string | null;
  readonly modality: "image";
  readonly aspectRatio: "1:1" | "unknown";
  /** Authoritative expected on-asset texts (from selected route / composition). */
  readonly expectedTexts: readonly string[] | null;
  readonly groundTruthStatus: "available" | "unavailable" | "reference_only";
  readonly expectTextPresence: boolean | null;
  readonly characteristics: {
    readonly textOverImage: boolean | null;
    readonly textOverGradient: boolean | null;
    readonly textOverSolid: boolean | null;
    readonly approxTextBlocks: number | null;
    readonly approxTextSize: "small" | "medium" | "large" | "unknown" | null;
    readonly textDensity: "minimal" | "moderate" | "dense" | "unknown" | null;
    readonly stylizedTypography: boolean | null;
    readonly logoLikely: boolean | null;
    readonly notes: string;
  };
};

export const REAL_OCR_CORPUS: readonly RealCorpusEntry[] = Object.freeze([
  {
    id: "real_01_phase8_sunflower_hello_sunshine",
    imageFile: "real_01_phase8_sunflower_hello_sunshine.png",
    sourcePathNote:
      "/tmp/phase8_sunflower_gvh_evidence/13_output.png (exec_32 Ideogram)",
    providerMeta: "ideogram/ideogram-3 (metadata only)",
    modality: "image",
    aspectRatio: "1:1",
    expectedTexts: Object.freeze([
      "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12",
    ]),
    groundTruthStatus: "available",
    expectTextPresence: true,
    characteristics: {
      textOverImage: true,
      textOverGradient: null,
      textOverSolid: false,
      approxTextBlocks: 1,
      approxTextSize: "medium",
      textDensity: "minimal",
      stylizedTypography: true,
      logoLikely: true,
      notes:
        "Known lifestyle+wordmark failure class; required intro often missing on canvas",
    },
  },
  {
    id: "real_02_phase8_bloomsip_refreshment",
    imageFile: "real_02_phase8_bloomsip_refreshment.png",
    sourcePathNote:
      "S3 GetObject art_syncimg_42 (BloomSip composition E2E)",
    providerMeta: "image provider from composition E2E (metadata only)",
    modality: "image",
    aspectRatio: "1:1",
    expectedTexts: Object.freeze([
      "Transform your everyday refresh with real botanicals and sparkling sophistication—meet BloomSip.",
      "Refreshment, Refined. Botanicals, Reimagined.",
      "Premium ingredients. Pure refreshment. Purely you.",
    ]),
    groundTruthStatus: "available",
    expectTextPresence: true,
    characteristics: {
      textOverImage: true,
      textOverGradient: null,
      textOverSolid: null,
      approxTextBlocks: 2,
      approxTextSize: "medium",
      textDensity: "moderate",
      stylizedTypography: true,
      logoLikely: true,
      notes: "Route Refreshment Refined — primary+headline+secondary available",
    },
  },
  {
    id: "real_03_exec42_sunflower_metaphor",
    imageFile: "real_03_exec42_sunflower_metaphor.png",
    sourcePathNote: "/tmp/exec42_output.png (local export of Ideogram creative)",
    providerMeta: "ideogram (metadata only)",
    modality: "image",
    aspectRatio: "1:1",
    expectedTexts: Object.freeze([
      "Sunflower nurtures every aspect of a child's development—helping them build strong foundations, grow confidently, and flourish in all areas of life.",
      "Growing minds. Growing humans.",
    ]),
    groundTruthStatus: "available",
    expectTextPresence: true,
    characteristics: {
      textOverImage: true,
      textOverGradient: null,
      textOverSolid: null,
      approxTextBlocks: 2,
      approxTextSize: "medium",
      textDensity: "moderate",
      stylizedTypography: true,
      logoLikely: true,
      notes: "Route The Sunflower Metaphor — primaryMessage from route JSON",
    },
  },
  {
    id: "real_04_exec43_sunny_introduction",
    imageFile: "real_04_exec43_sunny_introduction.png",
    sourcePathNote: "/tmp/art_syncimg_53_1789331724376_0.png",
    providerMeta: "ideogram (metadata only)",
    modality: "image",
    aspectRatio: "1:1",
    // Selected semantic direction stored OR-alternatives only — not a single authoritative string.
    expectedTexts: null,
    groundTruthStatus: "unavailable",
    expectTextPresence: true,
    characteristics: {
      textOverImage: true,
      textOverGradient: null,
      textOverSolid: null,
      approxTextBlocks: null,
      approxTextSize: "unknown",
      textDensity: "unknown",
      stylizedTypography: true,
      logoLikely: true,
      notes:
        "GROUND_TRUTH_UNAVAILABLE for message match: headlineAngle is OR-alternatives without primaryMessage field",
    },
  },
  {
    id: "real_05_brand_logo_reference",
    imageFile: "real_05_brand_logo_reference.jpg",
    sourcePathNote: "/tmp/sunflower_logo.jpg (brand identity mark, not a creative)",
    providerMeta: null,
    modality: "image",
    aspectRatio: "unknown",
    expectedTexts: null,
    groundTruthStatus: "reference_only",
    expectTextPresence: null,
    characteristics: {
      textOverImage: false,
      textOverGradient: false,
      textOverSolid: true,
      approxTextBlocks: 1,
      approxTextSize: "large",
      textDensity: "minimal",
      stylizedTypography: true,
      logoLikely: true,
      notes: "Identity mark reference — excluded from creative accuracy metrics",
    },
  },
]);
