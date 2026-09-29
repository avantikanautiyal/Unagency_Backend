/**
 * Phase 14 — production rendered-text OCR producer (tesseract.js).
 */

import {
  createTesseractRenderedTextProofProducer,
} from "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer";
import {
  produceRenderedTextProof,
  setRenderedTextProofProducer,
  nullRenderedTextProofProducer,
} from "../../../src/platform/cdf/generation-validation/rendered-text-proof";
import {
  registerProductionRenderedTextProofProducer,
  unregisterProductionRenderedTextProofProducer,
} from "../../../src/platform/cdf/generation-validation/register-production-rendered-text-proof";
import {
  claimForVisualVerificationCapability,
  platformHasVisualVerificationCapability,
  resetVisualVerificationCapabilityClaimsForTests,
} from "../../../src/platform/cdf/generation-validation/visual-verification-capabilities";
import {
  evaluateStructuralCompositionCompliance,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { deriveVisualVerificationRequirements } from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  createBlankPngFixture,
  createMalformedImageBytes,
  createRenderedTextPngFixture,
} from "./helpers/rendered-text-png-fixtures";

const contract = resolveDeliverableCompositionContract("social_creative")!;
const vreqs = deriveVisualVerificationRequirements(contract)!;

afterEach(() => {
  setRenderedTextProofProducer(nullRenderedTextProofProducer);
  resetVisualVerificationCapabilityClaimsForTests();
});

describe("Phase 14 — OCR capability registration", () => {
  it("OCR_TEXT_RECOGNITION is undeclared until producer registered", () => {
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
    expect(platformHasVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      false,
    );
  });

  it("registration marks OCR_TEXT_RECOGNITION declared (not generation)", () => {
    registerProductionRenderedTextProofProducer({ claim: "declared" });
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "declared",
    );
    expect(platformHasVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      true,
    );
    expect(
      claimForVisualVerificationCapability("VISION_IMAGE_ANALYSIS"),
    ).toBe("undeclared");
    unregisterProductionRenderedTextProofProducer();
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
  });
});

describe("Phase 14 — real tesseract OCR over image bytes", () => {
  it("extracts known rendered text from a PNG fixture (integration)", async () => {
    const bytes = createRenderedTextPngFixture({
      text: "HELLO",
      scale: 10,
      padding: 40,
    });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    setRenderedTextProofProducer(producer);
    const proof = await produceRenderedTextProof({
      artifactRef: { vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(proof?.outcome).toBe("ok");
    expect(proof?.source).toBe("ocr");
    const normalized = (proof?.extractedText ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    expect(normalized).toContain("HELLO");
  }, 120_000);

  it("blank image → ok + empty/whitespace text (verified absence)", async () => {
    const bytes = createBlankPngFixture(96);
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "bbbbbbbbbbbbbbbbbbbbbbbb" },
    });
    expect(proof?.outcome).toBe("ok");
    expect((proof?.extractedText ?? "").trim()).toBe("");
  }, 120_000);

  it("missing vault bytes → artifact_unavailable (not content failure)", async () => {
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => undefined,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "cccccccccccccccccccccccc" },
    });
    expect(proof?.outcome).toBe("artifact_unavailable");
  });

  it("malformed image → error outcome (UNVERIFIABLE path)", async () => {
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(createMalformedImageBytes()),
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "dddddddddddddddddddddddd" },
    });
    expect(proof?.outcome).toBe("error");
  });

  it("missing vaultAssetId → artifact_unavailable", async () => {
    const producer = createTesseractRenderedTextProofProducer({});
    const proof = await producer({ artifactRef: {} });
    expect(proof?.outcome).toBe("artifact_unavailable");
  });
});

describe("Phase 14 — OCR evidence → structural acceptance", () => {
  it("false positive: metadata Hello World, pixels wrong → NON_COMPLIANT blocks", async () => {
    const bytes = createRenderedTextPngFixture({ text: "OTHER COPY", scale: 8 });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "eeeeeeeeeeeeeeeeeeeeeeee" },
    });
    expect(proof?.outcome).toBe("ok");

    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "Hello World" },
        expectedRenderedTexts: ["Hello World"],
        renderedTextProof: proof!,
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(
      result.criteria.find((c) => c.criterionId === "rendered_text_match")
        ?.proofLevel,
    ).toBe("verified");
  }, 120_000);

  it("false negative guard: pixels contain expected → match COMPLIANT verified", async () => {
    const expected = "FRESH APPROACH";
    const bytes = createRenderedTextPngFixture({ text: expected, scale: 8 });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "ffffffffffffffffffffffff" },
    });
    expect(proof?.outcome).toBe("ok");

    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: [expected],
        renderedTextProof: proof!,
      },
      verificationRequirements: vreqs,
    });
    const match = result.criteria.find(
      (c) => c.criterionId === "rendered_text_match",
    )!;
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("COMPLIANT");
    expect(presence.proofLevel).toBe("verified");
    expect(match.status).toBe("COMPLIANT");
    expect(match.proofLevel).toBe("verified");
    // visual/brand remain unverifiable — do not require them this phase
    expect(result.blocksCanonicalCompletion).toBe(false);
  }, 120_000);

  it("Sunflower-class: wordmark-only pixels vs expected intro → NON_COMPLIANT", async () => {
    // Fixture text is deliberately NOT the educational intro message.
    const bytes = createRenderedTextPngFixture({
      text: "BRAND MARK",
      scale: 8,
      padding: 32,
    });
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "111111111111111111111111" },
    });
    expect(proof?.outcome).toBe("ok");
    expect((proof?.extractedText ?? "").trim().length).toBeGreaterThan(0);

    const expectedIntro =
      "Hello! We're Sunflower – a fresh approach to education for students in Classes 1-12";
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: [expectedIntro],
        renderedTextProof: proof!,
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.blocksCanonicalCompletion).toBe(true);
    expect(
      result.criteria.some(
        (c) =>
          c.criterionId === "rendered_text_match" &&
          c.status === "NON_COMPLIANT" &&
          c.proofLevel === "verified",
      ),
    ).toBe(true);
  }, 120_000);

  it("OCR error outcome → UNVERIFIABLE (not NON_COMPLIANT content failure)", () => {
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "claimed" },
        renderedTextProof: {
          extractedText: null,
          source: "ocr",
          outcome: "error",
          failureReason: "tesseract_recognize_failed",
        },
      },
      verificationRequirements: vreqs,
    });
    const presence = result.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("UNVERIFIABLE");
    expect(presence.proofLevel).toBe("unverifiable");
    // required rendered text with acceptanceOnUnmet=block still blocks
    expect(result.blocksCanonicalCompletion).toBe(true);
  });

  it("blank OCR success → NON_COMPLIANT verified absence", async () => {
    const bytes = createBlankPngFixture(64);
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => new Uint8Array(bytes),
      timeoutMs: 90_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "222222222222222222222222" },
    });
    const result = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        expectedRenderedTexts: ["REQUIRED MESSAGE"],
        renderedTextProof: proof!,
      },
      verificationRequirements: vreqs,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(
      result.criteria.find((c) => c.criterionId === "rendered_text_presence")
        ?.proofLevel,
    ).toBe("verified");
    expect(result.blocksCanonicalCompletion).toBe(true);
  }, 120_000);
});

describe("Phase 14 — static architecture audit", () => {
  it("OCR producer modules have no service/phase/provider semantic branches", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.resolve(
      __dirname,
      "../../../src/platform/cdf/generation-validation",
    );
    const files = [
      "ocr-tesseract-rendered-text-producer.ts",
      "register-production-rendered-text-proof.ts",
      "rendered-text-proof.ts",
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      if (/serviceId\s*===|phaseId\s*===|provider\s*===|platform\s*===/i.test(src)) {
        hits.push(`${f}: identity branch`);
      }
      if (/\binstagram\b|\bideogram\b/i.test(src)) {
        hits.push(`${f}: brand/provider token`);
      }
      if (/criterion\.(includes|startsWith|endsWith)\s*\(/.test(src)) {
        hits.push(`${f}: criterion string coupling`);
      }
    }
    expect(hits).toEqual([]);
  });
});
