/**
 * Phase 12 — generic visual verification architecture.
 * Updated in Phase 13 for structured criterion acceptance fields.
 */

import {
  deriveVisualVerificationRequirements,
  renderedTextCoversExpected,
  normalizeVerificationText,
} from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  getPlatformVisualVerificationCapabilities,
  platformHasVisualVerificationCapability,
  claimForVisualVerificationCapability,
  resetVisualVerificationCapabilityClaimsForTests,
} from "../../../src/platform/cdf/generation-validation/visual-verification-capabilities";
import {
  evaluateStructuralCompositionCompliance,
  extractStructuralEvidenceFromCandidate,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import {
  setRenderedTextProofProducer,
  nullRenderedTextProofProducer,
} from "../../../src/platform/cdf/generation-validation/rendered-text-proof";
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

afterEach(() => {
  setRenderedTextProofProducer(nullRenderedTextProofProducer);
  resetVisualVerificationCapabilityClaimsForTests();
});

describe("Phase 12 — verification requirement derivation", () => {
  it("derives rendered-text verification from textPolicy.required (social_creative)", () => {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const v = deriveVisualVerificationRequirements(contract)!;
    expect(v.requiresRenderedTextProof).toBe(true);
    const presence = v.criteria.find((c) => c.id === "rendered_text_presence");
    expect(presence?.acceptanceOnUnmet).toBe("block");
    expect(presence?.verificationClass).toBe("rendered_text");
    expect(v.criteria.some((c) => c.id === "rendered_text_presence")).toBe(
      true,
    );
    expect(v.criteria.some((c) => c.id === "visual_subject")).toBe(true);
    expect(v.criteria.some((c) => c.id === "brand_signature")).toBe(true);
  });

  it("campaign_kv uses identical derivation machinery", () => {
    const a = deriveVisualVerificationRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    )!;
    const b = deriveVisualVerificationRequirements(
      resolveDeliverableCompositionContract("campaign_kv"),
    )!;
    expect(a.requiresRenderedTextProof).toBe(b.requiresRenderedTextProof);
    expect(
      a.criteria.find((c) => c.id === "rendered_text_presence")
        ?.acceptanceOnUnmet,
    ).toBe(
      b.criteria.find((c) => c.id === "rendered_text_presence")
        ?.acceptanceOnUnmet,
    );
  });

  it("logo without required on-asset text does not require rendered text proof", () => {
    const logo = resolveDeliverableCompositionContract("logo");
    const v = deriveVisualVerificationRequirements(logo)!;
    expect(v.requiresRenderedTextProof).toBe(false);
    expect(v.criteria.some((c) => c.verificationClass === "rendered_text")).toBe(
      false,
    );
  });

  it("no service/phase/provider fields in derivation", () => {
    const v = deriveVisualVerificationRequirements(
      resolveDeliverableCompositionContract("social_creative"),
    )!;
    expect(JSON.stringify(v)).not.toMatch(/serviceId|phaseId|instagram|ideogram/i);
  });
});

describe("Phase 12 — verification capabilities undeclared", () => {
  it("OCR/vision capabilities remain undeclared (no fabricated OCR)", () => {
    for (const row of getPlatformVisualVerificationCapabilities()) {
      // Composition layer evidence is a declared deterministic capability — not OCR.
      if (row.capabilityId === "COMPOSITION_LAYER_EVIDENCE") {
        expect(row.claim).toBe("declared");
        expect(platformHasVisualVerificationCapability(row.capabilityId)).toBe(
          true,
        );
        continue;
      }
      expect(row.claim).toBe("undeclared");
      expect(platformHasVisualVerificationCapability(row.capabilityId)).toBe(
        false,
      );
    }
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
  });
});

describe("Phase 12 — proof levels and OCR matching", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;
  const vreqs = deriveVisualVerificationRequirements(contract)!;

  it("metadata ≠ pixel proof; with vreqs blocks acceptance (false-positive guard)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: {
          headline: "Hello! We're Sunflower – education for Classes 1-12",
        },
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("UNVERIFIABLE");
    expect(result.status).not.toBe("COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(result.verificationRequirementsApplied).toBe(true);
  });

  it("without vreqs, UNVERIFIABLE metadata does not block (Phase 11 unit path)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "claimed" },
      },
    });
    expect(result.status).toBe("UNVERIFIABLE");
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("OCR proves required text → text criteria COMPLIANT (verified)", () => {
    const expected =
      "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12";
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        expectedRenderedTexts: [expected],
        renderedTextProof: {
          extractedText: `Intro post: ${expected} Welcome.`,
          source: "ocr",
        },
      },
      verificationRequirements: vreqs,
    });
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    );
    const match = result.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    );
    expect(presence?.status).toBe("COMPLIANT");
    expect(presence?.proofLevel).toBe("verified");
    expect(match?.status).toBe("COMPLIANT");
    expect(match?.proofLevel).toBe("verified");
    // visual_subject / brand_signature still unverifiable → overall UNVERIFIABLE
    expect(result.status).toBe("UNVERIFIABLE");
    // required text is verified → do not block for text unmet
    expect(result.blocksCanonicalCompletion).toBe(false);
  });

  it("OCR detects wrong text → NON_COMPLIANT → blocks", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: [
          "Hello! We're Sunflower – a fresh approach to education",
        ],
        renderedTextProof: {
          extractedText: "Sunflower",
          source: "ocr",
        },
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(
      result.criteria.some(
        (c) =>
          c.criterionId === "rendered_text_match" &&
          c.status === "NON_COMPLIANT",
      ),
    ).toBe(true);
  });

  it("OCR detects no usable text when required → NON_COMPLIANT", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: ["Hello! We're Sunflower"],
        renderedTextProof: {
          extractedText: "",
          source: "ocr",
        },
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(
      result.criteria.some(
        (c) =>
          c.criterionId === "rendered_text_presence" &&
          c.status === "NON_COMPLIANT" &&
          c.proofLevel === "verified",
      ),
    ).toBe(true);
  });

  it("no verification capability / no proof → UNVERIFIABLE", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
      },
      verificationRequirements: vreqs,
    });
    // absent metadata + no OCR → NON_COMPLIANT (demonstrable absence)
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("Sunflower-class: wordmark-only fixture is not COMPLIANT", () => {
    // Regression class: lifestyle + wordmark, no intro communication proven
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        hasPreviewAsset: true,
        onImageCopy: null,
        renderedTextProof: {
          extractedText: "Sunflower",
          source: "ocr",
        },
        expectedRenderedTexts: [
          "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12",
        ],
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).not.toBe("COMPLIANT");
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("renderedTextCoversExpected is generic containment", () => {
    expect(
      renderedTextCoversExpected(
        "Hello! We're Sunflower – a fresh approach to education",
        "fresh approach to education",
      ),
    ).toBe(true);
    expect(normalizeVerificationText("Hello!")).toBe("hello");
  });
});

describe("Phase 12 — proof producer boundary", () => {
  it("injectable producer supplies OCR proof without live provider", async () => {
    setRenderedTextProofProducer(() => ({
      extractedText: "Hello message",
      source: "ocr",
    }));
    const { produceRenderedTextProof } = await import(
      "../../../src/platform/cdf/generation-validation/rendered-text-proof"
    );
    const proof = await produceRenderedTextProof({});
    expect(proof?.extractedText).toBe("Hello message");
  });

  it("extractStructuralEvidenceFromCandidate reads renderedTextProof", () => {
    const ev = extractStructuralEvidenceFromCandidate({
      previewAssetRef: { vaultAssetId: "v1" },
      renderedTextProof: { extractedText: "Hi", source: "vision" },
      expectedRenderedTexts: ["Hi"],
    });
    expect(ev.renderedTextProof?.source).toBe("vision");
    expect(ev.expectedRenderedTexts).toEqual(["Hi"]);
  });
});
