/**
 * Certification: Social Media → Instagram → Feed Post
 * Deterministic composition + OCR + structural acceptance (no live providers).
 */

import { PNG } from "pngjs";
import {
  resolveDeliverableCompositionContract,
  resolveElementRealization,
  isCompositionElementRequired,
  requiredDeterministicElements,
  requiredGeneratedElements,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  composeDeliverable,
  composedDiffersFromVisualPlate,
  evaluateCanvasCompliance,
  BITMAP_FONT_FAMILY,
} from "../../../../src/platform/cdf/deterministic-composition";
import {
  buildInstagramFeedPostCertFixture,
  CERT_CANVAS,
  CERT_PRIMARY_MESSAGE,
} from "../../../../src/platform/certification/fixtures/social-media-instagram-feed-post";
import {
  createTesseractRenderedTextProofProducer,
} from "../../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer";
import {
  evaluateStructuralCompositionCompliance,
} from "../../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { deriveVisualVerificationRequirements } from "../../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  setRenderedTextProofProducer,
  nullRenderedTextProofProducer,
} from "../../../../src/platform/cdf/generation-validation/rendered-text-proof";
import {
  registerProductionRenderedTextProofProducer,
  unregisterProductionRenderedTextProofProducer,
} from "../../../../src/platform/cdf/generation-validation/register-production-rendered-text-proof";
import { resetVisualVerificationCapabilityClaimsForTests } from "../../../../src/platform/cdf/generation-validation/visual-verification-capabilities";

afterEach(() => {
  setRenderedTextProofProducer(nullRenderedTextProofProducer);
  unregisterProductionRenderedTextProofProducer();
  resetVisualVerificationCapabilityClaimsForTests();
});

describe("Contract — realization modes (social_creative)", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;

  it("resolves generated vs deterministic realization", () => {
    expect(resolveElementRealization(contract, "visual_subject")).toBe(
      "generated",
    );
    expect(
      resolveElementRealization(contract, "primary_message_surface"),
    ).toBe("deterministic");
    expect(resolveElementRealization(contract, "brand_signature")).toBe(
      "deterministic",
    );
    expect(resolveElementRealization(contract, "layout_zones")).toBe(
      "deterministic",
    );
  });

  it("required / optional semantics preserved", () => {
    expect(
      isCompositionElementRequired(contract, "primary_message_surface"),
    ).toBe(true);
    expect(
      isCompositionElementRequired(contract, "secondary_message_surface"),
    ).toBe(false);
    expect(isCompositionElementRequired(contract, "call_to_action")).toBe(
      false,
    );
    expect(requiredDeterministicElements(contract)).toEqual(
      expect.arrayContaining([
        "primary_message_surface",
        "brand_signature",
        "layout_zones",
      ]),
    );
    expect(requiredGeneratedElements(contract)).toContain("visual_subject");
  });
});

describe("Golden Instagram Feed Post composition", () => {
  it("composes 1080×1080 PNG with deterministic text + logo", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const result = composeDeliverable(fixture.compositionInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mimeType).toBe("image/png");
    expect(result.widthPx).toBe(1080);
    expect(result.heightPx).toBe(1080);
    expect(result.isFinalComposedDeliverable).toBe(true);
    expect(result.rawVisualIsNotAcceptanceSubject).toBe(true);
    expect(composedDiffersFromVisualPlate(result)).toBe(true);

    const png = PNG.sync.read(result.bytes);
    expect(png.width).toBe(1080);
    expect(png.height).toBe(1080);

    const primary = result.layers.find(
      (l) => l.element === "primary_message_surface",
    )!;
    expect(primary.realization).toBe("deterministic");
    expect(primary.rendered).toBe(true);
    expect(primary.text).toBe(CERT_PRIMARY_MESSAGE);
    expect(primary.insideSafeArea).toBe(true);

    const logo = result.layers.find((l) => l.element === "brand_signature")!;
    expect(logo.realization).toBe("deterministic");
    expect(logo.rendered).toBe(true);
    expect(logo.source).toBe("brand_asset");
    expect(logo.insideSafeArea).toBe(true);

    const visual = result.layers.find((l) => l.element === "visual_subject")!;
    expect(visual.realization).toBe("generated");
    expect(visual.rendered).toBe(true);

    expect(result.layers.some((l) => l.element === "layout_zones")).toBe(true);
    expect(result.contentHash).not.toBe(result.sourceVisualHash);
    expect(result.contentHash).not.toBe(fixture.visualHash);
  });

  it("fails closed when required primary message is missing", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const result = composeDeliverable({
      ...fixture.compositionInput,
      primaryMessage: undefined,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_REQUIRED_DETERMINISTIC_VALUE");
    expect(result.element).toBe("primary_message_surface");
  });

  it("fails closed when required brand mark is missing", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const result = composeDeliverable({
      ...fixture.compositionInput,
      brandMark: undefined,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_REQUIRED_DETERMINISTIC_VALUE");
    expect(result.element).toBe("brand_signature");
  });

  it("uses deterministic bitmap typography family", () => {
    expect(BITMAP_FONT_FAMILY).toBe("unagency.bitmap.5x7");
  });
});

describe("Canvas verification (generic)", () => {
  it("1080×1080 passes", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const composed = composeDeliverable(fixture.compositionInput);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const v = evaluateCanvasCompliance({
      required: CERT_CANVAS,
      actual: {
        widthPx: composed.widthPx,
        heightPx: composed.heightPx,
        mimeType: composed.mimeType,
        bytes: composed.bytes,
      },
    });
    expect(v.status).toBe("COMPLIANT");
  });

  it("incorrect dimensions fail", () => {
    const v = evaluateCanvasCompliance({
      required: CERT_CANVAS,
      actual: { widthPx: 800, heightPx: 800 },
    });
    expect(v.status).toBe("NON_COMPLIANT");
  });

  it("incorrect aspect ratio fails", () => {
    const v = evaluateCanvasCompliance({
      required: CERT_CANVAS,
      actual: { widthPx: 1080, heightPx: 1350 },
    });
    expect(v.status).toBe("NON_COMPLIANT");
  });
});

describe("Brand proof via composition-layer evidence", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;
  const vreqs = deriveVisualVerificationRequirements(contract)!;

  it("deterministic brand evidence → COMPLIANT brand criterion", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const composed = composeDeliverable(fixture.compositionInput);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence: {
        compositionLayerEvidence: composed.layers,
        expectedRenderedTexts: [fixture.primaryMessage],
        renderedTextProof: {
          source: "ocr",
          outcome: "ok",
          extractedText: fixture.primaryMessage,
        },
        canvasRequirement: {
          widthPx: CERT_CANVAS.widthPx,
          heightPx: CERT_CANVAS.heightPx,
        },
        canvasActual: {
          widthPx: composed.widthPx,
          heightPx: composed.heightPx,
          mimeType: composed.mimeType,
        },
        isFinalComposedDeliverable: true,
      },
    });

    const brand = result.criteria.find(
      (c) => c.criterionId === "brand_signature",
    )!;
    expect(brand.status).toBe("COMPLIANT");
    expect(brand.proofLevel).toBe("verified");
  });

  it("missing composition evidence does not become COMPLIANT for brand", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence: {
        compositionLayerEvidence: [],
        expectedRenderedTexts: [CERT_PRIMARY_MESSAGE],
        renderedTextProof: {
          source: "ocr",
          outcome: "ok",
          extractedText: CERT_PRIMARY_MESSAGE,
        },
      },
    });
    const brand = result.criteria.find(
      (c) => c.criterionId === "brand_signature",
    )!;
    expect(brand.status).not.toBe("COMPLIANT");
    expect(brand.status).toBe("NON_COMPLIANT");
  });
});

describe("Structural acceptance matrix", () => {
  const contract = resolveDeliverableCompositionContract("social_creative")!;
  const vreqs = deriveVisualVerificationRequirements(contract)!;

  function baseEvidence(overrides: Record<string, unknown> = {}) {
    const fixture = buildInstagramFeedPostCertFixture();
    const composed = composeDeliverable(fixture.compositionInput);
    if (!composed.ok) throw new Error("compose failed in helper");
    return {
      fixture,
      composed,
      evidence: {
        compositionLayerEvidence: composed.layers,
        expectedRenderedTexts: [fixture.primaryMessage],
        renderedTextProof: {
          source: "ocr" as const,
          outcome: "ok" as const,
          extractedText: fixture.primaryMessage,
        },
        canvasRequirement: {
          widthPx: CERT_CANVAS.widthPx,
          heightPx: CERT_CANVAS.heightPx,
        },
        canvasActual: {
          widthPx: composed.widthPx,
          heightPx: composed.heightPx,
          mimeType: composed.mimeType,
        },
        isFinalComposedDeliverable: true,
        ...overrides,
      },
    };
  }

  it("complete fixture = COMPLIANT", () => {
    const { evidence } = baseEvidence();
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence,
    });
    expect(result.status).toBe("COMPLIANT");
  });

  it("incorrect required text = NON_COMPLIANT", () => {
    const { evidence } = baseEvidence({
      renderedTextProof: {
        source: "ocr",
        outcome: "ok",
        extractedText: "Completely wrong message on pixels",
      },
    });
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence,
    });
    expect(result.status).toBe("NON_COMPLIANT");
  });

  it("missing required text proof = NON_COMPLIANT", () => {
    const { evidence } = baseEvidence({
      renderedTextProof: {
        source: "ocr",
        outcome: "ok",
        extractedText: "",
      },
    });
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence,
    });
    expect(result.status).toBe("NON_COMPLIANT");
  });

  it("invalid canvas = NON_COMPLIANT", () => {
    const { evidence } = baseEvidence({
      canvasActual: { widthPx: 640, heightPx: 640, mimeType: "image/png" },
    });
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(
      result.criteria.find((c) => c.criterionId === "canvas_dimensions")
        ?.status,
    ).toBe("NON_COMPLIANT");
  });

  it("raw visual plate is not the acceptance subject", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const composed = composeDeliverable(fixture.compositionInput);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.isFinalComposedDeliverable).toBe(true);
    expect(Buffer.compare(composed.bytes, fixture.visualBytes)).not.toBe(0);
    expect(composed.contentHash).not.toBe(fixture.visualHash);
  });
});

describe("OCR + structural chain (live tesseract, no providers)", () => {
  it("fixture → compose → OCR → structural COMPLIANT", async () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const composed = composeDeliverable(fixture.compositionInput);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    registerProductionRenderedTextProofProducer({ claim: "declared" });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(composed.bytes),
      timeoutMs: 120_000,
    });
    setRenderedTextProofProducer(producer);
    const proof = await producer({
      artifactRef: { vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(proof?.outcome).toBe("ok");
    expect((proof?.extractedText ?? "").trim().length).toBeGreaterThan(0);

    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const vreqs = deriveVisualVerificationRequirements(contract)!;
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence: {
        compositionLayerEvidence: composed.layers,
        expectedRenderedTexts: [fixture.primaryMessage],
        renderedTextProof: proof!,
        canvasRequirement: {
          widthPx: CERT_CANVAS.widthPx,
          heightPx: CERT_CANVAS.heightPx,
        },
        canvasActual: {
          widthPx: composed.widthPx,
          heightPx: composed.heightPx,
          mimeType: composed.mimeType,
        },
        isFinalComposedDeliverable: true,
      },
    });

    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    const match = result.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    expect(presence.status).toBe("COMPLIANT");
    expect(match.status).toBe("COMPLIANT");
    expect(result.status).toBe("COMPLIANT");
  }, 180_000);
});
