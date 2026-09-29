/**
 * Phase 14.6 — real-artifact OCR corpus runner + offline preprocessing experiment.
 * Measurement only. Does not change production OCR or acceptance.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
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
  REAL_OCR_CORPUS,
  type RealCorpusEntry,
} from "./helpers/real-ocr-corpus-manifest";

const CORPUS_ROOT = path.resolve(
  __dirname,
  "../../../tmp-ocr-real-corpus",
);
const IMAGES_DIR = path.join(CORPUS_ROOT, "images");
const REPORT_DIR = path.resolve(
  __dirname,
  "../../../tmp-ocr-benchmark-phase14_6",
);

export type RealCorpusClassification =
  | "TRUE_POSITIVE"
  | "TRUE_NEGATIVE"
  | "FALSE_POSITIVE"
  | "FALSE_NEGATIVE"
  | "UNVERIFIABLE"
  | "PRODUCER_ERROR"
  | "GROUND_TRUTH_UNAVAILABLE";

export type RealCorpusRow = {
  readonly artifact: string;
  readonly providerMeta: string | null;
  readonly modality: string;
  readonly aspectRatio: string;
  readonly expectedTexts: readonly string[] | null;
  readonly extracted: string;
  readonly outcome: string;
  readonly confidence: number | null;
  readonly latencyMs: number;
  readonly presenceDetected: boolean;
  readonly messageMatch: boolean | null;
  readonly presenceCorrect: boolean | null;
  readonly messageMatchCorrect: boolean | null;
  readonly classification: RealCorpusClassification;
  readonly failureTaxonomy: string | null;
  readonly pathLabel: "memory_vault_resolver" | "byte_inject";
  readonly characteristics: RealCorpusEntry["characteristics"];
  readonly error: string | null;
};

function taxonomyFor(input: {
  readonly entry: RealCorpusEntry;
  readonly extracted: string;
  readonly outcome: string;
  readonly messageMatch: boolean | null;
}): string | null {
  if (
    input.outcome === "error" ||
    input.outcome === "artifact_unavailable" ||
    input.outcome === "producer_unavailable"
  ) {
    return "artifact_access_or_producer_runtime";
  }
  if (input.entry.groundTruthStatus !== "available") return null;
  if (input.messageMatch === true) return null;
  const ext = input.extracted.trim();
  if (!ext) return "no_detection";
  // Partial token overlap with expected?
  const expected = input.entry.expectedTexts ?? [];
  const joined = expected.join(" ").toLowerCase();
  const tokens = joined
    .split(/\W+/)
    .filter((t) => t.length > 3)
    .slice(0, 12);
  const hits = tokens.filter((t) => ext.toLowerCase().includes(t)).length;
  if (hits === 0) return "character_corruption_or_wrong_text";
  if (hits / Math.max(1, tokens.length) < 0.5) return "partial_garbled_text";
  // Matcher may reject even when OCR has some tokens
  const matcherWould =
    expected.length > 0 &&
    expected.some((e) => renderedTextCoversExpected(ext, e));
  if (!matcherWould) return "ocr_evidence_insufficient_for_match";
  return "matcher";
}

function classify(input: {
  readonly entry: RealCorpusEntry;
  readonly outcome: string;
  readonly presenceDetected: boolean;
  readonly messageMatch: boolean | null;
}): RealCorpusClassification {
  if (
    input.outcome === "error" ||
    input.outcome === "artifact_unavailable" ||
    input.outcome === "producer_unavailable"
  ) {
    return "PRODUCER_ERROR";
  }
  if (
    input.entry.groundTruthStatus === "unavailable" ||
    input.entry.groundTruthStatus === "reference_only"
  ) {
    return "GROUND_TRUTH_UNAVAILABLE";
  }
  // Presence + message (expected presence true for all available creative cases)
  const presenceOk =
    input.entry.expectTextPresence == null
      ? null
      : input.presenceDetected === input.entry.expectTextPresence;
  const matchOk = input.messageMatch === true;

  if (input.entry.expectTextPresence === true) {
    if (matchOk) return "TRUE_POSITIVE";
    // Presence wrong or match wrong → FN for required message recovery
    if (!input.presenceDetected) return "FALSE_NEGATIVE";
    return "FALSE_NEGATIVE";
  }
  if (input.entry.expectTextPresence === false) {
    if (!input.presenceDetected && !matchOk) return "TRUE_NEGATIVE";
    return "FALSE_POSITIVE";
  }
  void presenceOk;
  return "UNVERIFIABLE";
}

async function ocrBytes(
  bytes: Uint8Array,
  vaultAssetId: string,
  pathLabel: RealCorpusRow["pathLabel"],
): Promise<{
  extracted: string;
  outcome: string;
  confidence: number | null;
  error: string | null;
  latencyMs: number;
}> {
  const started = Date.now();
  if (pathLabel === "memory_vault_resolver") {
    setDefaultVaultAssetResolver(
      createMemoryVaultAssetResolver({ [vaultAssetId]: bytes }),
    );
    const producer = createTesseractRenderedTextProofProducer({
      timeoutMs: 120_000,
    });
    const proof = await producer({
      artifactRef: { vaultAssetId, mimeType: "image/png" },
    });
    return {
      extracted: proof?.extractedText ?? "",
      outcome: proof?.outcome ?? "null",
      confidence:
        typeof proof?.confidence === "number" ? proof.confidence : null,
      error: proof?.failureReason ?? null,
      latencyMs: Date.now() - started,
    };
  }
  const producer = createTesseractRenderedTextProofProducer({
    resolveBytes: async () => bytes,
    timeoutMs: 120_000,
  });
  const proof = await producer({
    artifactRef: { vaultAssetId, mimeType: "image/png" },
  });
  return {
    extracted: proof?.extractedText ?? "",
    outcome: proof?.outcome ?? "null",
    confidence: typeof proof?.confidence === "number" ? proof.confidence : null,
    error: proof?.failureReason ?? null,
    latencyMs: Date.now() - started,
  };
}

function runEntrySyncParts(
  entry: RealCorpusEntry,
  ocr: {
    extracted: string;
    outcome: string;
    confidence: number | null;
    error: string | null;
    latencyMs: number;
  },
  pathLabel: RealCorpusRow["pathLabel"],
): RealCorpusRow {
  const presenceDetected = ocr.extracted.trim().length > 0;
  let messageMatch: boolean | null = null;
  if (entry.groundTruthStatus === "available" && entry.expectedTexts) {
    if (ocr.outcome === "ok") {
      messageMatch =
        applyRenderedTextMatchPolicy({
          policy: "normalized_containment",
          extractedText: ocr.extracted,
          expectedTexts: entry.expectedTexts,
        }) === "matched";
    } else {
      messageMatch = false;
    }
  }
  const classification = classify({
    entry,
    outcome: ocr.outcome,
    presenceDetected,
    messageMatch,
  });
  const presenceCorrect =
    entry.expectTextPresence == null
      ? null
      : presenceDetected === entry.expectTextPresence;
  const messageMatchCorrect =
    entry.groundTruthStatus !== "available" ? null : messageMatch === true;

  return {
    artifact: entry.id,
    providerMeta: entry.providerMeta,
    modality: entry.modality,
    aspectRatio: entry.aspectRatio,
    expectedTexts: entry.expectedTexts,
    extracted: ocr.extracted.replace(/\s+/g, " ").trim().slice(0, 400),
    outcome: ocr.outcome,
    confidence: ocr.confidence,
    latencyMs: ocr.latencyMs,
    presenceDetected,
    messageMatch,
    presenceCorrect,
    messageMatchCorrect,
    classification,
    failureTaxonomy: taxonomyFor({
      entry,
      extracted: ocr.extracted,
      outcome: ocr.outcome,
      messageMatch,
    }),
    pathLabel,
    characteristics: entry.characteristics,
    error: ocr.error,
  };
}

/** Offline-only preprocessing variants — never wired into production. */
function preprocessVariant(
  pngBuf: Buffer,
  variant: "raw" | "grayscale" | "contrast" | "enlarged" | "thresholded",
): Buffer {
  if (variant === "raw") return pngBuf;
  const png = PNG.sync.read(pngBuf);
  const out = new PNG({ width: png.width, height: png.height });

  const sample = (x: number, y: number) => {
    const i = (png.width * y + x) << 2;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!] as const;
  };

  if (variant === "enlarged") {
    const scale = 2;
    const big = new PNG({
      width: png.width * scale,
      height: png.height * scale,
    });
    for (let y = 0; y < big.height; y++) {
      for (let x = 0; x < big.width; x++) {
        const [r, g, b] = sample(Math.floor(x / scale), Math.floor(y / scale));
        const i = (big.width * y + x) << 2;
        big.data[i] = r;
        big.data[i + 1] = g;
        big.data[i + 2] = b;
        big.data[i + 3] = 255;
      }
    }
    return PNG.sync.write(big);
  }

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      let [r, g, b] = sample(x, y);
      if (variant === "grayscale" || variant === "contrast" || variant === "thresholded") {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        r = g = b = gray;
      }
      if (variant === "contrast") {
        const factor = 1.6;
        const adj = (v: number) =>
          Math.max(0, Math.min(255, Math.round((v - 128) * factor + 128)));
        r = adj(r);
        g = adj(g);
        b = adj(b);
      }
      if (variant === "thresholded") {
        const v = r > 140 ? 255 : 0;
        r = g = b = v;
      }
      const i = (out.width * y + x) << 2;
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

describe("Phase 14.6 — real artifact OCR corpus", () => {
  const rows: RealCorpusRow[] = [];
  const preprocessRows: Array<{
    artifact: string;
    variant: string;
    extracted: string;
    messageMatch: boolean | null;
    presenceDetected: boolean;
    latencyMs: number;
  }> = [];

  afterEach(() => {
    setRenderedTextProofProducer(nullRenderedTextProofProducer);
    resetVisualVerificationCapabilityClaimsForTests();
    setDefaultVaultAssetResolver(null);
  });

  afterAll(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const usable = rows.filter((r) => r.classification !== "GROUND_TRUTH_UNAVAILABLE");
    const gt = rows.filter(
      (r) =>
        REAL_OCR_CORPUS.find((e) => e.id === r.artifact)?.groundTruthStatus ===
        "available",
    );
    const presenceEval = gt.filter((r) => r.presenceCorrect != null);
    const matchEval = gt.filter((r) => r.messageMatchCorrect != null);
    const summary = {
      totalArtifacts: rows.length,
      usableForPresence: presenceEval.length,
      groundTruthAvailable: gt.length,
      presenceAccuracy:
        presenceEval.length === 0
          ? null
          : presenceEval.filter((r) => r.presenceCorrect).length /
            presenceEval.length,
      messageMatchAccuracy:
        matchEval.length === 0
          ? null
          : matchEval.filter((r) => r.messageMatchCorrect).length /
            matchEval.length,
      falseNegatives: gt.filter((r) => r.classification === "FALSE_NEGATIVE")
        .length,
      falsePositives: gt.filter((r) => r.classification === "FALSE_POSITIVE")
        .length,
      producerErrors: rows.filter((r) => r.classification === "PRODUCER_ERROR")
        .length,
      groundTruthUnavailable: rows.filter(
        (r) => r.classification === "GROUND_TRUTH_UNAVAILABLE",
      ).length,
      note: "Sample size is small; do not treat as production reliability.",
      productionPreprocessing: "No preprocessing — raw bytes to tesseract.recognize",
      capabilityClaim: claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION"),
    };
    const report = {
      phase: "14.6",
      generatedAt: new Date().toISOString(),
      summary,
      rows,
      offlinePreprocessExperiment: preprocessRows,
    };
    fs.writeFileSync(
      path.join(REPORT_DIR, "real-artifact-ocr-corpus.json"),
      JSON.stringify(report, null, 2),
    );
    // eslint-disable-next-line no-console
    console.info("[phase14.6] real corpus summary", JSON.stringify(summary, null, 2));
  });

  it("corpus images exist on disk (skip-hard if empty)", () => {
    expect(fs.existsSync(IMAGES_DIR)).toBe(true);
    const present = REAL_OCR_CORPUS.filter((e) =>
      fs.existsSync(path.join(IMAGES_DIR, e.imageFile)),
    );
    expect(present.length).toBeGreaterThanOrEqual(3);
  });

  it("runs production Tesseract via memory VaultAssetResolver on real creatives", async () => {
    for (const entry of REAL_OCR_CORPUS) {
      const imgPath = path.join(IMAGES_DIR, entry.imageFile);
      if (!fs.existsSync(imgPath)) continue;
      const bytes = new Uint8Array(fs.readFileSync(imgPath));
      const vaultId = "cccccccccccccccccccccccc";
      const ocr = await ocrBytes(bytes, vaultId, "memory_vault_resolver");
      rows.push(runEntrySyncParts(entry, ocr, "memory_vault_resolver"));
    }
    expect(rows.length).toBeGreaterThanOrEqual(3);
  }, 600_000);

  it("separates presence vs message-match for ground-truth-available cases", () => {
    const gt = rows.filter(
      (r) =>
        REAL_OCR_CORPUS.find((e) => e.id === r.artifact)?.groundTruthStatus ===
        "available",
    );
    expect(gt.length).toBeGreaterThan(0);
    for (const r of gt) {
      expect(typeof r.presenceDetected).toBe("boolean");
      expect(r.messageMatch === null || typeof r.messageMatch === "boolean").toBe(
        true,
      );
    }
  });

  it("records GROUND_TRUTH_UNAVAILABLE when expected text cannot be determined", () => {
    const row = rows.find((r) => r.artifact.includes("exec43"));
    if (!row) return;
    expect(row.classification).toBe("GROUND_TRUTH_UNAVAILABLE");
  });

  it("documents production preprocessing: none", () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/grayscale|threshold|sharpen|contrast.?norm/i);
    expect(src).toMatch(/Tesseract\.recognize\(buffer/);
  });

  it("offline preprocessing experiment on one FN-prone creative (not production)", async () => {
    const entry = REAL_OCR_CORPUS.find((e) =>
      e.id.includes("sunflower_hello_sunshine"),
    )!;
    const imgPath = path.join(IMAGES_DIR, entry.imageFile);
    if (!fs.existsSync(imgPath)) return;
    const raw = fs.readFileSync(imgPath);
    // Only PNG variants for pngjs preprocess
    if (!entry.imageFile.endsWith(".png")) return;

    for (const variant of [
      "raw",
      "grayscale",
      "contrast",
      "enlarged",
      "thresholded",
    ] as const) {
      const buf = preprocessVariant(raw, variant);
      const ocr = await ocrBytes(
        new Uint8Array(buf),
        "dddddddddddddddddddddddd",
        "byte_inject",
      );
      let messageMatch: boolean | null = null;
      if (entry.expectedTexts && ocr.outcome === "ok") {
        messageMatch =
          applyRenderedTextMatchPolicy({
            policy: "normalized_containment",
            extractedText: ocr.extracted,
            expectedTexts: entry.expectedTexts,
          }) === "matched";
      }
      preprocessRows.push({
        artifact: entry.id,
        variant,
        extracted: ocr.extracted.replace(/\s+/g, " ").trim().slice(0, 200),
        messageMatch,
        presenceDetected: ocr.extracted.trim().length > 0,
        latencyMs: ocr.latencyMs,
      });
    }
    expect(preprocessRows.length).toBe(5);
  }, 600_000);

  it("does not change OCR_TEXT_RECOGNITION claim", () => {
    expect(claimForVisualVerificationCapability("OCR_TEXT_RECOGNITION")).toBe(
      "undeclared",
    );
  });

  it("static architecture: no provider/service OCR branches in production producer", () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/platform/cdf/generation-validation/ocr-tesseract-rendered-text-producer.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/serviceId\s*===|phaseId\s*===|provider\s*===/);
    expect(src).not.toMatch(/\binstagram\b|\bideogram\b/i);
  });
});
