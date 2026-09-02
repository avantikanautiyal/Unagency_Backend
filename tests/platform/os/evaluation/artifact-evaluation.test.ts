/**
 * Step 6 — Automated artifact/quality evaluation tests.
 */

import {
  analyzeAccessibility,
  analyzeBrandAdherence,
  analyzeSeo,
  analyzeVisualHierarchy,
  analyzePdfBytes,
  analyzeImageBytes,
  runArtifactEvaluation,
  ARTIFACT_EVALUATION_VERSION,
  ARTIFACT_EVALUATOR_ID,
} from "../../../../src/platform/os/evaluation/artifact-evaluation";
import { validateOutputContract } from "../../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine";
import {
  resolveBenchmarkValidationAsync,
  getBenchmarkCase,
  createBenchmarkAsyncMediaPlatform,
  materializeBenchmarkOsArtifacts,
  buildBenchmarkOsMetadata,
  DEFAULT_BENCHMARK_STRATEGY,
  runBenchmark,
  createBenchmarkProviderExecutor,
  InMemoryBenchmarkPerformanceRecordStore,
  checkComparisonCompatibility,
  type BenchmarkModelTarget,
} from "../../../../src/platform/providers/routing/performance/benchmark";
import { ControllableDispatcher } from "../../../../src/platform/providers/runtime/testing";
import { loadAdaptiveRoutingConfig } from "../../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type { IDirectExecutionEngine } from "../../../../src/platform/direct/contracts";
import { success } from "../../../../src/platform/core/result";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Professional Multipage Brochure</title>
  <meta name="description" content="Professional multipage brochure suitable for print or digital distribution meeting industry expectations." />
  <link rel="canonical" href="https://example.com/brochure" />
  <meta name="robots" content="index,follow" />
</head>
<body>
  <header><nav><a href="#main">Skip</a></nav></header>
  <main id="main">
    <h1>Professional Brochure</h1>
    <h2>Overview</h2>
    <p>Professional multipage brochure suitable for print or digital distribution.</p>
    <img src="/hero.png" alt="Hero visual for brochure" />
    <a href="/contact"><button>Get Started</button></a>
  </main>
  <footer>Contact</footer>
</body>
</html>`;

describe("Step 6 — Automated Artifact Evaluation", () => {
  const textModel: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    capabilityId: "text.generate",
  });

  describe("HTML artifact analysis", () => {
    it("measures SEO from actual HTML artifact", () => {
      const seo = analyzeSeo(SAMPLE_HTML);
      expect(seo.evaluated).toBe(true);
      expect(seo.score).toBeGreaterThan(70);
      expect(seo.findings.some((f) => f.checkId === "title_present" && f.passed)).toBe(true);
    });

    it("detects accessibility violations from actual HTML", () => {
      const badHtml = SAMPLE_HTML.replace(/alt="[^"]+"/, "");
      const a11y = analyzeAccessibility(badHtml);
      expect(a11y.evaluated).toBe(true);
      expect(a11y.criticalCount).toBeGreaterThan(0);
    });

    it("scores visual hierarchy heuristically from rendered HTML structure", () => {
      const hierarchy = analyzeVisualHierarchy(SAMPLE_HTML);
      expect(hierarchy.score).toBeGreaterThan(50);
      expect(hierarchy.confidence).toBe("heuristic");
    });

    it("evaluates brand adherence against brand context, not model claims", () => {
      const brand = analyzeBrandAdherence({
        html: SAMPLE_HTML,
        brandColors: ["#C41E3A"],
        brandPreferredTerms: ["professional", "brochure"],
      });
      expect(brand.evaluated).toBe(true);
      expect(brand.matchedTerms.length).toBeGreaterThan(0);
    });
  });

  describe("PDF and image artifact analysis", () => {
    it("validates PDF bytes and estimates page count", () => {
      const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n/Type /Page\n/Count 4\n%%EOF");
      const doc = analyzePdfBytes(pdfHeader, 4);
      expect(doc.isValidPdf).toBe(true);
      expect(doc.evaluated).toBe(true);
    });

    it("measures image dimensions from actual bytes", () => {
      // 1x1 PNG
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const image = analyzeImageBytes(png, "image/png");
      expect(image.evaluated).toBe(true);
      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image.confidence).toBe("measured");
    });
  });

  describe("Step 2 integration", () => {
    it("feeds artifact evaluation into validateOutputContract for website SEO", () => {
      const result = validateOutputContract({
        organizationId: "org_eval",
        executionId: "exec_eval",
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        preview: SAMPLE_HTML,
        artifactEvaluation: {
          htmlContent: SAMPLE_HTML,
          seo: analyzeSeo(SAMPLE_HTML),
          accessibility: analyzeAccessibility(SAMPLE_HTML),
          visual: Object.freeze({
            evaluated: true,
            dimensions: Object.freeze([analyzeVisualHierarchy(SAMPLE_HTML)]),
            confidence: "heuristic",
          }),
          performance: Object.freeze({
            evaluated: false,
            score: 0,
            confidence: "not_automated",
            evidence: Object.freeze(["no runtime"]),
          }),
          provenance: Object.freeze([]),
        },
      });

      expect(result).toBeDefined();
      const seoDim = result!.qualityDimensions.find((d) => d.dimensionId.includes("seo"));
      if (seoDim) {
        expect(seoDim.status).not.toBe("NOT_AUTOMATED");
      }
      expect(result!.provenance.some((p) => p.field === "artifactEvaluatorId")).toBe(true);
    });

    it("preserves NOT_AUTOMATED for performance without browser measurements", async () => {
      const enrichment = await runArtifactEvaluation({
        organizationId: "org_eval",
        executionId: "exec_perf",
        preview: SAMPLE_HTML,
      });
      expect(enrichment.artifactEvaluation.performance?.evaluated).toBe(false);
      expect(enrichment.artifactEvaluation.performance?.confidence).toBe("not_automated");
    });
  });

  describe("benchmark pipeline integration", () => {
    const brochurePlan = {
      title: "Professional Multipage Brochure",
      summary:
        "A professional deliverable suitable for print or digital distribution meeting industry expectations.",
      sections: [
        {
          heading: "Overview",
          body: "Professional multipage brochure suitable for print or digital distribution.",
        },
        { heading: "Services", body: "Deliverable content aligned with standard industry expectations." },
        { heading: "Proof", body: "Trusted professional brochure format for print and digital channels." },
        { heading: "Contact", body: "Request your professional brochure deliverable today." },
      ],
    };

    it("runs artifact evaluation before Step 2 validation on materialized PDF", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const media = createBenchmarkAsyncMediaPlatform();
      const metadata = buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step6",
        executionId: "exec_pdf",
      });
      const materialized = await materializeBenchmarkOsArtifacts({
        benchmarkCase: bc,
        asyncMedia: media.platform,
        executionId: "exec_pdf",
        organizationId: "org_step6",
        metadata,
        runtimeOutput: {
          structured: brochurePlan,
          content: JSON.stringify(brochurePlan),
        },
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        createId: (p) => `${p}_s6`,
      });

      const outcome = await resolveBenchmarkValidationAsync({
        benchmarkCase: bc,
        executionOutput: {
          preview: materialized.preview,
          structuredData: materialized.structuredData,
          mediaArtifactIds: materialized.mediaArtifactIds,
          buildSucceeded: materialized.buildSucceeded,
          latencyMs: 20,
        },
        organizationId: "org_step6",
        executionId: "exec_pdf",
        artifactEvaluationDeps: {
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
        },
      });

      expect(outcome.kind).toBe("validated");
      if (outcome.kind === "validated") {
        expect(outcome.validation.provenance.some((p) => p.field === "artifactEvaluatorId")).toBe(
          true,
        );
        const measured = outcome.validation.qualityDimensions.filter(
          (d) => d.status === "PASS" || d.status === "FAIL",
        );
        expect(measured.length).toBeGreaterThan(0);
      }
    });

    it("records artifact evaluator provenance on ModelPerformanceRecord", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const media = createBenchmarkAsyncMediaPlatform();
      const engine: IDirectExecutionEngine = {
        async run() {
          return success({
            resultId: "res_s6",
            requestId: "exec_rec",
            request: {} as never,
            artifacts: {
              runtime: {
                requestId: "exec_rec",
                sessionId: "sess",
                status: "completed",
                success: true,
                response: {
                  requestId: "exec_rec",
                  providerId: "provider.openai" as never,
                  output: {
                    structured: brochurePlan,
                    content: JSON.stringify(brochurePlan),
                  },
                  streamed: false,
                  finishedAt: new Date().toISOString(),
                },
                statistics: {
                  queueWaitMs: 0,
                  dispatchMs: 0,
                  executionMs: 10,
                  streamingMs: 0,
                  totalMs: 10,
                  attempts: 1,
                  retries: 0,
                  timeouts: 0,
                  streamingChunks: 0,
                },
                completedAt: new Date().toISOString(),
              },
            },
            trace: {} as never,
            stagesCompleted: ["provider_runtime"],
            success: true,
            durationMs: 10,
            createdAt: new Date().toISOString(),
            version: "direct.1",
          });
        },
        async runPostProcessing() {
          return success({} as never);
        },
      };

      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: bc.benchmarkId,
          model: textModel,
          organizationId: "org_step6",
          executeModel: createBenchmarkProviderExecutor({
            dispatcher: new ControllableDispatcher({ mode: "success" }),
            osBridge: {
              engine,
              asyncMedia: media.platform,
              artifactsRepo: media.artifactsRepo,
            },
          }),
        },
        { recordStore: store },
      );

      expect(record.artifactEvaluatorId).toBe(ARTIFACT_EVALUATOR_ID);
      expect(record.artifactEvaluatorVersion).toBe(ARTIFACT_EVALUATION_VERSION);
      expect(record.measuredQualityDimensions.length).toBeGreaterThan(0);
    });
  });

  describe("evaluator provenance and fair comparison", () => {
    it("flags incompatible comparison when artifact evaluator versions differ", () => {
      const base = {
        benchmarkId: "bench.print.brochures",
        contractVersion: "1.0.0",
        artifactEvaluatorVersion: ARTIFACT_EVALUATION_VERSION,
      };
      const compat = checkComparisonCompatibility(
        base as never,
        { ...base, artifactEvaluatorVersion: "step6.0" } as never,
      );
      expect(compat.compatible).toBe(false);
      expect(compat.reasons.some((r) => r.includes("artifactEvaluatorVersion"))).toBe(true);
    });
  });

  describe("production safety", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });
  });
});
