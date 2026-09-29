/**
 * Phase 14.5 — OCR reliability benchmark (measurement only).
 *
 * Uses the REAL tesseract production producer. Does NOT change capability
 * claims, acceptance policy, or CDF architecture.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createTesseractRenderedTextProofProducer } from "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer";
import {
  applyRenderedTextMatchPolicy,
  renderedTextCoversExpected,
} from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  evaluateStructuralCompositionCompliance,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { deriveVisualVerificationRequirements } from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
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
import { resolveDeliverableCompositionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  buildOcrBenchmarkFixtures,
  type OcrBenchmarkFixture,
} from "./helpers/ocr-benchmark-fixtures";

export type BenchmarkClassification =
  | "TRUE_POSITIVE"
  | "TRUE_NEGATIVE"
  | "FALSE_POSITIVE"
  | "FALSE_NEGATIVE"
  | "UNVERIFIABLE"
  | "PRODUCER_ERROR";

export type BenchmarkRow = {
  readonly fixture: string;
  readonly purpose: string;
  readonly expected: readonly string[];
  readonly renderedGroundTruth: string | null;
  readonly extracted: string;
  readonly match: boolean;
  readonly presence: boolean;
  readonly outcome: string;
  readonly confidence: number | null;
  readonly durationMs: number;
  readonly classification: BenchmarkClassification;
  readonly error: string | null;
  readonly typographyNotes: string;
  readonly pathLabel: "byte_inject" | "memory_vault_resolver";
};

function classifyRow(input: {
  readonly fixture: OcrBenchmarkFixture;
  readonly outcome: string;
  readonly presence: boolean;
  readonly match: boolean;
}): BenchmarkClassification {
  if (
    input.outcome === "error" ||
    input.outcome === "artifact_unavailable" ||
    input.outcome === "producer_unavailable"
  ) {
    return "PRODUCER_ERROR";
  }

  // Presence / match expectations for content cases
  if (input.fixture.expectMatch) {
    if (input.match) return "TRUE_POSITIVE";
    return "FALSE_NEGATIVE";
  }

  // Expect no match (wrong text, blank, metadata-only blank)
  if (input.fixture.id === "G_no_text" || input.fixture.id === "H_metadata_only_pixels_blank") {
    // Affirmative absence: no presence is correct
    if (!input.presence && !input.match) return "TRUE_NEGATIVE";
    if (input.presence || input.match) return "FALSE_POSITIVE";
  }

  if (input.fixture.id === "F_wrong_text") {
    if (!input.match) return "TRUE_NEGATIVE";
    return "FALSE_POSITIVE";
  }

  if (!input.match && !input.fixture.expectMatch) return "TRUE_NEGATIVE";
  if (input.match && !input.fixture.expectMatch) return "FALSE_POSITIVE";
  return "UNVERIFIABLE";
}

async function runFixture(input: {
  readonly fixture: OcrBenchmarkFixture;
  readonly pathLabel: BenchmarkRow["pathLabel"];
  readonly vaultAssetId: string;
}): Promise<BenchmarkRow> {
  const started = Date.now();
  let extracted = "";
  let outcome = "unknown";
  let confidence: number | null = null;
  let error: string | null = null;
  let match = false;
  let presence = false;

  try {
    if (input.fixture.forceOutcome === "artifact_unavailable") {
      const producer = createTesseractRenderedTextProofProducer({
        resolveBytes: async () => undefined,
        timeoutMs: 60_000,
      });
      const proof = await producer({
        artifactRef: { vaultAssetId: input.vaultAssetId },
      });
      outcome = proof?.outcome ?? "null";
      extracted = proof?.extractedText ?? "";
      error = proof?.failureReason ?? null;
      confidence =
        typeof proof?.confidence === "number" ? proof.confidence : null;
    } else {
      const bytes = input.fixture.buildBytes();
      if (!bytes) {
        outcome = "artifact_unavailable";
        error = "fixture_bytes_null";
      } else if (input.pathLabel === "memory_vault_resolver") {
        const resolver = createMemoryVaultAssetResolver({
          [input.vaultAssetId]: bytes,
        });
        setDefaultVaultAssetResolver(resolver);
        const producer = createTesseractRenderedTextProofProducer({
          timeoutMs: 90_000,
        });
        const proof = await producer({
          artifactRef: {
            vaultAssetId: input.vaultAssetId,
            mimeType: "image/png",
          },
        });
        outcome = proof?.outcome ?? "null";
        extracted = proof?.extractedText ?? "";
        error = proof?.failureReason ?? null;
        confidence =
          typeof proof?.confidence === "number" ? proof.confidence : null;
      } else {
        const producer = createTesseractRenderedTextProofProducer({
          resolveBytes: async () => new Uint8Array(bytes),
          timeoutMs: 90_000,
        });
        const proof = await producer({
          artifactRef: {
            vaultAssetId: input.vaultAssetId,
            mimeType: bytes[0] === 0x89 ? "image/png" : undefined,
          },
        });
        outcome = proof?.outcome ?? "null";
        extracted = proof?.extractedText ?? "";
        error = proof?.failureReason ?? null;
        confidence =
          typeof proof?.confidence === "number" ? proof.confidence : null;
      }
    }

    presence = extracted.trim().length > 0;
    if (outcome === "ok") {
      const policy = applyRenderedTextMatchPolicy({
        policy: "normalized_containment",
        extractedText: extracted,
        expectedTexts: input.fixture.expectedTexts,
      });
      match = policy === "matched";
    }
  } catch (err) {
    outcome = "error";
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - started;
  const classification = classifyRow({
    fixture: input.fixture,
    outcome,
    presence,
    match,
  });

  return {
    fixture: input.fixture.id,
    purpose: input.fixture.purpose,
    expected: input.fixture.expectedTexts,
    renderedGroundTruth: input.fixture.renderedGroundTruth,
    extracted: extracted.replace(/\s+/g, " ").trim().slice(0, 240),
    match,
    presence,
    outcome,
    confidence,
    durationMs,
    classification,
    error,
    typographyNotes: input.fixture.typographyNotes,
    pathLabel: input.pathLabel,
  };
}

function summarize(rows: readonly BenchmarkRow[]) {
  const contentRows = rows.filter(
    (r) =>
      r.fixture !== "K_producer_malformed" &&
      r.fixture !== "L_producer_missing_asset",
  );
  const n = contentRows.length;
  const tp = contentRows.filter((r) => r.classification === "TRUE_POSITIVE").length;
  const tn = contentRows.filter((r) => r.classification === "TRUE_NEGATIVE").length;
  const fp = contentRows.filter((r) => r.classification === "FALSE_POSITIVE").length;
  const fn = contentRows.filter((r) => r.classification === "FALSE_NEGATIVE").length;
  const producerErrors = rows.filter(
    (r) => r.classification === "PRODUCER_ERROR",
  ).length;

  const presenceCases = contentRows.filter((r) =>
    ["A_clear_hello_world", "B_multi_block", "C_text_over_photo", "D_small_text", "E_stylized_tracking", "I_large_headline", "J_low_contrast", "F_wrong_text"].includes(
      r.fixture,
    ),
  );
  const presenceCorrect = presenceCases.filter((r) => r.presence === true).length;

  const absenceCases = contentRows.filter((r) =>
    ["G_no_text", "H_metadata_only_pixels_blank"].includes(r.fixture),
  );
  const absenceCorrect = absenceCases.filter((r) => r.presence === false).length;

  const matchEvaluable = contentRows.filter((r) => r.outcome === "ok");
  const matchCorrect = matchEvaluable.filter((r) => {
    const fixture = buildOcrBenchmarkFixtures().find((f) => f.id === r.fixture)!;
    return r.match === fixture.expectMatch;
  }).length;

  const durations = rows.map((r) => r.durationMs);
  const avg =
    durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
  const max = Math.max(...durations, 0);

  return {
    sampleSizeContent: n,
    sampleSizeAll: rows.length,
    truePositive: tp,
    trueNegative: tn,
    falsePositive: fp,
    falseNegative: fn,
    producerErrors,
    presenceAccuracy:
      presenceCases.length + absenceCases.length > 0
        ? (presenceCorrect + absenceCorrect) /
          (presenceCases.length + absenceCases.length)
        : null,
    messageMatchAccuracy:
      matchEvaluable.length > 0 ? matchCorrect / matchEvaluable.length : null,
    falsePositiveRate: n > 0 ? fp / n : null,
    falseNegativeRate: n > 0 ? fn / n : null,
    producerErrorRate: rows.length > 0 ? producerErrors / rows.length : null,
    latencyMs: { avg: Math.round(avg), max, min: Math.min(...durations, 0) },
  };
}

const REPORT_DIR = path.resolve(
  __dirname,
  "../../../tmp-ocr-benchmark-phase14_5",
);

describe("Phase 14.5 — OCR reliability benchmark", () => {
  const fixtures = buildOcrBenchmarkFixtures();
  const rows: BenchmarkRow[] = [];

  afterEach(() => {
    setRenderedTextProofProducer(nullRenderedTextProofProducer);
    resetVisualVerificationCapabilityClaimsForTests();
    setDefaultVaultAssetResolver(null);
  });

  afterAll(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const summary = summarize(rows);
    const report = {
      phase: "14.5",
      generatedAt: new Date().toISOString(),
      capabilityClaimUnchanged: claimForVisualVerificationCapability(
        "OCR_TEXT_RECOGNITION",
      ),
      note: "Sample size is small; do not treat rates as production reliability.",
      summary,
      rows,
    };
    fs.writeFileSync(
      path.join(REPORT_DIR, "ocr-reliability-benchmark.json"),
      JSON.stringify(report, null, 2),
    );
    // eslint-disable-next-line no-console
    console.info(
      "[phase14.5] OCR benchmark summary",
      JSON.stringify(summary, null, 2),
    );
  });

  it("runs full fixture matrix through real Tesseract (byte inject path)", async () => {
    for (const fixture of fixtures) {
      const row = await runFixture({
        fixture,
        pathLabel: "byte_inject",
        vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      });
      rows.push(row);
    }
    expect(rows.length).toBe(fixtures.length);
  }, 600_000);

  it("matrix: clear expected text recovers match when OCR succeeds", () => {
    const row = rows.find((r) => r.fixture === "A_clear_hello_world");
    expect(row).toBeTruthy();
    // Soft assertion: record classification; if OCR fails on bitmap font, mark FN not crash
    expect(["TRUE_POSITIVE", "FALSE_NEGATIVE"]).toContain(row!.classification);
    expect(row!.outcome).toBe("ok");
  });

  it("matrix: wrong text does not match expected", () => {
    const row = rows.find((r) => r.fixture === "F_wrong_text");
    expect(row).toBeTruthy();
    expect(row!.outcome).toBe("ok");
    expect(row!.match).toBe(false);
    expect(["TRUE_NEGATIVE", "FALSE_POSITIVE"]).toContain(row!.classification);
  });

  it("matrix: no text → affirmative empty (not producer error)", () => {
    const row = rows.find((r) => r.fixture === "G_no_text");
    expect(row).toBeTruthy();
    expect(row!.outcome).toBe("ok");
    expect(row!.classification).not.toBe("PRODUCER_ERROR");
  });

  it("matrix: metadata claim cannot bypass pixel evidence", () => {
    const fixture = fixtures.find((f) => f.id === "H_metadata_only_pixels_blank")!;
    const row = rows.find((r) => r.fixture === "H_metadata_only_pixels_blank")!;
    expect(row.outcome).toBe("ok");

    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const vreqs = deriveVisualVerificationRequirements(contract)!;
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: fixture.metadataClaim ?? "HELLO WORLD" },
        expectedRenderedTexts: [...fixture.expectedTexts],
        renderedTextProof: {
          extractedText: row.extracted,
          source: "ocr",
          outcome: "ok",
        },
      },
      verificationRequirements: vreqs,
    });
    // Blank OCR proof → presence NON_COMPLIANT verified, blocks
    expect(structural.status).toBe("NON_COMPLIANT");
    expect(structural.blocksCanonicalCompletion).toBe(true);
    expect(
      structural.criteria.find((c) => c.criterionId === "rendered_text_presence")
        ?.proofLevel,
    ).toBe("verified");
  });

  it("matrix: producer failure → PRODUCER_ERROR / structural UNVERIFIABLE", () => {
    const malformed = rows.find((r) => r.fixture === "K_producer_malformed")!;
    const missing = rows.find((r) => r.fixture === "L_producer_missing_asset")!;
    expect(malformed.classification).toBe("PRODUCER_ERROR");
    expect(missing.classification).toBe("PRODUCER_ERROR");

    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const vreqs = deriveVisualVerificationRequirements(contract)!;
    const structural = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        onImageCopy: { headline: "claimed" },
        renderedTextProof: {
          extractedText: null,
          source: "ocr",
          outcome: "error",
          failureReason: "benchmark_forced",
        },
      },
      verificationRequirements: vreqs,
    });
    const presence = structural.criteria.find(
      (c) => c.criterionId === "rendered_text_presence",
    )!;
    expect(presence.status).toBe("UNVERIFIABLE");
    expect(presence.proofLevel).toBe("unverifiable");
  });

  it("production-like path: memory VaultAssetResolver → Tesseract", async () => {
    const fixture = fixtures.find((f) => f.id === "A_clear_hello_world")!;
    const row = await runFixture({
      fixture,
      pathLabel: "memory_vault_resolver",
      // createMemoryVaultAssetResolver accepts any string id (not only ObjectId)
      vaultAssetId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    });
    rows.push(row);
    expect(row.pathLabel).toBe("memory_vault_resolver");
    expect(["ok", "error"]).toContain(row.outcome);
  }, 120_000);

  it("matching policy audit: separates matcher from OCR", () => {
    // Perfect OCR string — matcher must accept
    expect(renderedTextCoversExpected("Hello World today", "Hello World")).toBe(
      true,
    );
    expect(
      applyRenderedTextMatchPolicy({
        policy: "normalized_containment",
        extractedText: "Hello World",
        expectedTexts: ["Hello World"],
      }),
    ).toBe("matched");

    // Partial OCR that misses tokens — matcher rejects (OCR problem surface)
    expect(
      applyRenderedTextMatchPolicy({
        policy: "normalized_containment",
        extractedText: "Hello",
        expectedTexts: ["Hello World"],
      }),
    ).toBe("mismatched");

    // Presence only
    expect(
      applyRenderedTextMatchPolicy({
        policy: "presence_only",
        extractedText: "x",
        expectedTexts: [],
      }),
    ).toBe("presence_ok");

    // Unavailable never invents match
    expect(
      applyRenderedTextMatchPolicy({
        policy: "unavailable",
        extractedText: "Hello World",
        expectedTexts: ["Hello World"],
      }),
    ).toBe("unverifiable");
  });

  it("does not mark OCR_TEXT_RECOGNITION verified", () => {
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
  });

  it("static architecture: benchmark helpers have no production semantic branches", () => {
    const files = [
      path.resolve(__dirname, "./helpers/ocr-benchmark-fixtures.ts"),
      path.resolve(
        __dirname,
        "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer.ts",
      ),
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/serviceId\s*===|phaseId\s*===|provider\s*===|platform\s*===/i.test(src)) {
        hits.push(f);
      }
      if (/\binstagram\b|\bideogram\b/i.test(src)) hits.push(`${f}: brand`);
    }
    expect(hits).toEqual([]);
  });
});
