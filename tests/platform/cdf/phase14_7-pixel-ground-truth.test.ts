/**
 * Phase 14.7 — rendered-text ground truth & OCR error separation.
 * Evidence only. Does not change production OCR / acceptance / capabilities.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createTesseractRenderedTextProofProducer } from "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer";
import {
  applyRenderedTextMatchPolicy,
  renderedTextCoversExpected,
} from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  claimForVisualVerificationCapability,
  resetVisualVerificationCapabilityClaimsForTests,
} from "../../../src/platform/cdf/generation-validation/visual-verification-capabilities";
import {
  setRenderedTextProofProducer,
  nullRenderedTextProofProducer,
} from "../../../src/platform/cdf/generation-validation/rendered-text-proof";
import { createMemoryVaultAssetResolver } from "../../../src/platform/cdf/rendering/asset-resolver";
import { setDefaultVaultAssetResolver } from "../../../src/platform/cdf/rendering/default-vault-asset-resolver";
import {
  PIXEL_GROUND_TRUTH_ANNOTATIONS,
  classifyDualDimension,
  type DualDimensionClassification,
} from "./helpers/pixel-ground-truth-annotations";

const CORPUS_IMAGES = path.resolve(
  __dirname,
  "../../../tmp-ocr-real-corpus/images",
);
const REPORT_DIR = path.resolve(
  __dirname,
  "../../../tmp-ocr-benchmark-phase14_7",
);

/** Phase 14.6 prior classifications for reconciliation (from published report). */
const PHASE_14_6_PRIOR: ReadonlyArray<{
  readonly artifact: string;
  readonly extracted: string;
  readonly previousClassification: string;
}> = [
  {
    artifact: "real_01_phase8_sunflower_hello_sunshine",
    extracted: "y \\ Sunfls=wer",
    previousClassification: "FALSE_NEGATIVE",
  },
  {
    artifact: "real_02_phase8_bloomsip_refreshment",
    extracted: "(garble / UI chrome)",
    previousClassification: "FALSE_NEGATIVE",
  },
  {
    artifact: "real_03_exec42_sunflower_metaphor",
    extracted: "FORMAT",
    previousClassification: "FALSE_NEGATIVE",
  },
];

type Row = {
  readonly artifact: string;
  readonly expectedText: string | null;
  readonly pixelPresence: string;
  readonly location: string;
  readonly annotationNotes: string;
  readonly ocrOutput: string;
  readonly ocrPresence: boolean;
  readonly ocrMessageMatch: boolean | null;
  readonly classification: DualDimensionClassification;
  readonly observedVisible: readonly string[];
  readonly correctedInterpretation: string;
  readonly previousClassification: string | null;
};

describe("Phase 14.7 — pixel ground truth & OCR error separation", () => {
  const rows: Row[] = [];

  afterEach(() => {
    setRenderedTextProofProducer(nullRenderedTextProofProducer);
    resetVisualVerificationCapabilityClaimsForTests();
    setDefaultVaultAssetResolver(null);
  });

  afterAll(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const withExpected = rows.filter((r) => r.expectedText != null);
    const present = withExpected.filter((r) => r.pixelPresence === "PRESENT");
    const absent = withExpected.filter((r) => r.pixelPresence === "ABSENT");
    const uncertain = withExpected.filter(
      (r) => r.pixelPresence === "UNCERTAIN",
    );

    const requiredRenderedRate =
      withExpected.length === 0
        ? null
        : present.length / withExpected.length;

    const ocrConditional = {
      sampleSizePresent: present.length,
      messageRecovery:
        present.length === 0
          ? null
          : present.filter((r) => r.ocrMessageMatch === true).length /
            present.length,
      presenceRecovery:
        present.length === 0
          ? null
          : present.filter((r) => r.ocrPresence).length / present.length,
      falseNegatives: present.filter(
        (r) => r.classification === "OCR_FALSE_NEGATIVE",
      ).length,
      falsePositives: rows.filter(
        (r) => r.classification === "OCR_FALSE_POSITIVE",
      ).length,
    };

    // Visible-text OCR recovery (observed canvas text, not expectedTexts)
    const visibleRecoveryNotes = PIXEL_GROUND_TRUTH_ANNOTATIONS.map((a) => ({
      artifact: a.artifactId,
      observed: a.observedVisibleTexts.map((o) => o.text),
    }));

    const report = {
      phase: "14.7",
      generatedAt: new Date().toISOString(),
      note: "Human pixel annotations are benchmark-only; not runtime authority.",
      capabilityClaimUnchanged: claimForVisualVerificationCapability(
        "OCR_TEXT_RECOGNITION",
      ),
      summary: {
        totalArtifacts: PIXEL_GROUND_TRUTH_ANNOTATIONS.length,
        artifactsWithAuthoritativeExpected: withExpected.length,
        artifactsWithPixelAnnotations: PIXEL_GROUND_TRUTH_ANNOTATIONS.length,
        expectedBlocksPresent: present.length,
        expectedBlocksAbsent: absent.length,
        expectedBlocksUncertain: uncertain.length,
        requiredTextRenderedRate: requiredRenderedRate,
        ocrConditionalOnPixelPresent: ocrConditional,
        generationAbsenceConfirmed: rows.filter(
          (r) => r.classification === "GENERATION_ABSENCE_CONFIRMED",
        ).length,
      },
      sunflowerDetermination: {
        requiredIntroVisible: false,
        pixelPresence: "ABSENT",
        conclusion:
          "Required 'Hello! We're Sunflower…' communication is NOT visible. Only stylized wordmark 'Sunflower' is present. This is a generation/rendering miss, not an OCR miss for the required message.",
      },
      visibleTextOcrSpotCheck: visibleRecoveryNotes,
      reconciliation14_6: rows
        .filter((r) =>
          PHASE_14_6_PRIOR.some((p) => p.artifact === r.artifact),
        )
        .map((r) => ({
          artifact: r.artifact,
          expectedText: r.expectedText,
          pixelPresent: r.pixelPresence,
          previousOcr: PHASE_14_6_PRIOR.find((p) => p.artifact === r.artifact)
            ?.extracted,
          previousClassification: r.previousClassification,
          correctedInterpretation: r.correctedInterpretation,
          dualClassification: r.classification,
        })),
      rows,
    };
    fs.writeFileSync(
      path.join(REPORT_DIR, "pixel-ground-truth-report.json"),
      JSON.stringify(report, null, 2),
    );
    // eslint-disable-next-line no-console
    console.info(
      "[phase14.7] summary",
      JSON.stringify(report.summary, null, 2),
    );
  });

  it("annotations cover the Phase 14.6 creative corpus (excl. logo)", () => {
    expect(PIXEL_GROUND_TRUTH_ANNOTATIONS.map((a) => a.artifactId)).toEqual([
      "real_01_phase8_sunflower_hello_sunshine",
      "real_02_phase8_bloomsip_refreshment",
      "real_03_exec42_sunflower_metaphor",
      "real_04_exec43_sunny_introduction",
    ]);
  });

  it("Sunflower required intro is ABSENT on pixels (human annotation)", () => {
    const a = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((x) =>
      x.artifactId.includes("sunflower_hello"),
    )!;
    expect(a.overallExpectedPresence).toBe("ABSENT");
    expect(a.expectedBlocks[0]!.pixelPresence).toBe("ABSENT");
    expect(a.observedVisibleTexts.some((o) => /sunflower/i.test(o.text))).toBe(
      true,
    );
  });

  it("runs production OCR and builds dual-dimension matrix", async () => {
    for (const ann of PIXEL_GROUND_TRUTH_ANNOTATIONS) {
      const imgPath = path.join(CORPUS_IMAGES, ann.imageFile);
      expect(fs.existsSync(imgPath)).toBe(true);
      const bytes = new Uint8Array(fs.readFileSync(imgPath));
      const vaultId = "eeeeeeeeeeeeeeeeeeeeeeee";
      setDefaultVaultAssetResolver(
        createMemoryVaultAssetResolver({ [vaultId]: bytes }),
      );
      const producer = createTesseractRenderedTextProofProducer({
        timeoutMs: 120_000,
      });
      const proof = await producer({
        artifactRef: { vaultAssetId: vaultId, mimeType: "image/png" },
      });
      const extracted = (proof?.extractedText ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const ocrOk = proof?.outcome === "ok";
      const ocrPresence = extracted.length > 0;

      const expectedList =
        ann.expectedBlocks.length > 0
          ? ann.expectedBlocks.map((b) => b.expectedText)
          : null;

      let ocrMessageMatch: boolean | null = null;
      if (expectedList && ocrOk) {
        ocrMessageMatch =
          applyRenderedTextMatchPolicy({
            policy: "normalized_containment",
            extractedText: extracted,
            expectedTexts: expectedList,
          }) === "matched";
      }

      const pixelPresence =
        ann.overallExpectedPresence === "N/A"
          ? "N/A"
          : ann.overallExpectedPresence;

      const classification = classifyDualDimension({
        pixelPresence,
        ocrMessageMatch,
        ocrExtractedNonEmpty: ocrPresence,
        ocrOutcomeOk: ocrOk,
      });

      // Matcher separation: if pixel PRESENT and OCR string covers expected under
      // exact normalized check but policy fails — not applicable when ABSENT.
      let corrected = "";
      if (pixelPresence === "ABSENT") {
        corrected =
          "generation_failure — required text not on pixels; prior message FN is not OCR FN";
      } else if (pixelPresence === "PRESENT" && ocrMessageMatch === false) {
        const anyCovers =
          expectedList?.some((e) => renderedTextCoversExpected(extracted, e)) ??
          false;
        corrected = anyCovers
          ? "matcher_failure"
          : "ocr_failure — text present but OCR did not recover expected message";
      } else if (pixelPresence === "N/A") {
        corrected = "requirement_gt_unavailable";
      } else {
        corrected = "see dual classification";
      }

      const prior = PHASE_14_6_PRIOR.find((p) => p.artifact === ann.artifactId);

      // One row per artifact (aggregate expected blocks)
      rows.push({
        artifact: ann.artifactId,
        expectedText: expectedList ? expectedList.join(" | ") : null,
        pixelPresence: String(pixelPresence),
        location: ann.expectedBlocks[0]?.approximateLocation ?? "unknown",
        annotationNotes: ann.generationQualityNote,
        ocrOutput: extracted.slice(0, 300),
        ocrPresence,
        ocrMessageMatch,
        classification,
        observedVisible: ann.observedVisibleTexts.map((o) => o.text),
        correctedInterpretation: corrected,
        previousClassification: prior?.previousClassification ?? null,
      });
    }
    expect(rows.length).toBe(4);
  }, 300_000);

  it("required-text-rendered rate is generation metric (not OCR)", () => {
    const blocks = PIXEL_GROUND_TRUTH_ANNOTATIONS.flatMap((a) => a.expectedBlocks);
    expect(blocks.length).toBeGreaterThan(0);
    const present = blocks.filter((b) => b.pixelPresence === "PRESENT").length;
    // All annotated expected blocks in this corpus are ABSENT
    expect(present).toBe(0);
    expect(present / blocks.length).toBe(0);
  });

  it("OCR conditional recovery sample size on PRESENT expected text is 0", () => {
    const presentExpected = PIXEL_GROUND_TRUTH_ANNOTATIONS.flatMap((a) =>
      a.expectedBlocks.filter((b) => b.pixelPresence === "PRESENT"),
    );
    expect(presentExpected.length).toBe(0);
  });

  it("reconciliation: Phase 14.6 FNs for sunflower/bloomsip/exec42 are generation misses", () => {
    const targets = rows.filter((r) =>
      [
        "real_01_phase8_sunflower_hello_sunshine",
        "real_02_phase8_bloomsip_refreshment",
        "real_03_exec42_sunflower_metaphor",
      ].includes(r.artifact),
    );
    expect(targets.length).toBe(3);
    for (const r of targets) {
      expect(r.pixelPresence).toBe("ABSENT");
      expect(r.classification).toBe("GENERATION_ABSENCE_CONFIRMED");
      expect(r.correctedInterpretation).toMatch(/generation_failure/);
    }
  });

  it("visible-text spot check: FORMAT and Unagency OCR recovery (not expectedTexts)", async () => {
    // When text IS on the canvas, Tesseract recovers high-contrast simple words.
    const formatAnn = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((a) =>
      a.artifactId.includes("exec42"),
    )!;
    const bytes = new Uint8Array(
      fs.readFileSync(path.join(CORPUS_IMAGES, formatAnn.imageFile)),
    );
    const producer = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => bytes,
      timeoutMs: 120_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId: "ffffffffffffffffffffffff" },
    });
    expect(proof?.outcome).toBe("ok");
    expect((proof?.extractedText ?? "").toUpperCase()).toContain("FORMAT");

    const unAnn = PIXEL_GROUND_TRUTH_ANNOTATIONS.find((a) =>
      a.artifactId.includes("exec43"),
    )!;
    const bytes2 = new Uint8Array(
      fs.readFileSync(path.join(CORPUS_IMAGES, unAnn.imageFile)),
    );
    const producer2 = createTesseractRenderedTextProofProducer({
      resolveBytes: async () => bytes2,
      timeoutMs: 120_000,
    });
    const p2 = await producer2({
      artifactRef: { vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect((p2?.extractedText ?? "").toLowerCase()).toContain("unagency");
  }, 180_000);

  it("does not change OCR capability claim", () => {
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
  });

  it("annotations are benchmark-only (no production semantic branches)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "./helpers/pixel-ground-truth-annotations.ts"),
      "utf8",
    );
    expect(src).toMatch(/BENCHMARK EVIDENCE ONLY/);
    expect(src).not.toMatch(/serviceId\s*===|phaseId\s*===|provider\s*===/);
  });
});
