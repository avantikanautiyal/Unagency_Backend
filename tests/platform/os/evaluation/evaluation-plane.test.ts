/**
 * Step 7 — Generalized Evaluation & Observation Plane tests.
 */

import {
  runEvaluationPlane,
  resolveModalityProfile,
  resolveDimensionApplicability,
  evaluateTextAdapter,
  evaluateHtmlAdapter,
  evaluateImageAdapter,
  evaluateDocumentAdapter,
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../../../../src/platform/os/evaluation/evaluation-plane";
import { runArtifactEvaluation } from "../../../../src/platform/os/evaluation/artifact-evaluation";
import { validateOutputContract } from "../../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine";
import {
  resolveBenchmarkValidationAsync,
  getBenchmarkCase,
  checkComparisonCompatibility,
} from "../../../../src/platform/providers/routing/performance/benchmark";
import { loadAdaptiveRoutingConfig } from "../../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type { HydratedArtifact } from "../../../../src/platform/os/evaluation/artifact-evaluation/types";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email Campaign</title>
  <meta name="description" content="Professional email campaign for product launch." />
</head>
<body>
  <main><h1>Launch</h1><p>Professional email content for product launch campaign.</p></main>
</body>
</html>`;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PDF_HEADER = Buffer.from("%PDF-1.4\n1 0 obj\n/Type /Page\n/Count 2\n%%EOF");

function mockHydrated(artifacts: HydratedArtifact[]) {
  return async () => artifacts;
}

describe("Step 7 — Generalized Evaluation Plane", () => {
  describe("modality profiles and applicability", () => {
    it("marks SEO NOT_APPLICABLE for text output kinds", () => {
      const profile = resolveModalityProfile("text");
      const seo = resolveDimensionApplicability(profile, "quality.seo");
      expect(seo.status).toBe("NOT_APPLICABLE");
    });

    it("marks SEO applicable-but-not-automated for website until measured", () => {
      const profile = resolveModalityProfile("deferred_website");
      expect(profile.supportsRuntime).toBe(true);
      const perf = resolveDimensionApplicability(profile, "quality.performance");
      expect(perf.status).toBe("NOT_AUTOMATED");
    });

    it("marks runtime NOT_APPLICABLE for image artifacts", () => {
      const profile = resolveModalityProfile("image");
      expect(profile.supportsRuntime).toBe(false);
      const runtime = resolveDimensionApplicability(profile, "hard.website.no_critical_runtime");
      expect(runtime.status).toBe("NOT_APPLICABLE");
    });

    it("supports rendered evaluation for presentation output kind", () => {
      const profile = resolveModalityProfile("presentation");
      expect(profile.supportsRendered).toBe(true);
      expect(profile.applicableDimensions).toContain("quality.visual_quality");
    });
  });

  describe("static evaluation adapters", () => {
    it("evaluates text/copywriting via semantic static metrics", () => {
      const result = evaluateTextAdapter({
        executionId: "exec_text",
        organizationId: "org",
        preview:
          "Professional social copywriting deliverable for product launch campaign meeting audience expectations.",
        briefObjective: "product launch social copywriting",
      });
      expect(result.metrics.some((m) => m.metricId === "text.word_count")).toBe(true);
      expect(result.metrics.some((m) => m.measurementStatus === "HEURISTIC")).toBe(true);
    });

    it("evaluates image dimensions from artifact bytes", () => {
      const artifact: HydratedArtifact = Object.freeze({
        artifactId: "art_img",
        mimeType: "image/png",
        byteSize: PNG_1X1.length,
        bytes: PNG_1X1,
        kind: "image",
      });
      const result = evaluateImageAdapter(
        { executionId: "exec_img", organizationId: "org", outputKind: "image" },
        artifact,
      );
      const width = result.metrics.find((m) => m.metricId === "image.width");
      expect(width?.measurementStatus).toBe("MEASURED");
      expect(width?.value).toBe(1);
    });

    it("evaluates document PDF structure", async () => {
      const artifact: HydratedArtifact = Object.freeze({
        artifactId: "art_pdf",
        mimeType: "application/pdf",
        byteSize: PDF_HEADER.length,
        bytes: PDF_HEADER,
        kind: "pdf",
      });
      const result = await evaluateDocumentAdapter(
        {
          executionId: "exec_doc",
          organizationId: "org",
          outputKind: "document",
          structuredOutput: { sections: [{ heading: "A" }, { heading: "B" }] },
        },
        [artifact],
      );
      expect(result.metrics.some((m) => m.metricId === "document.valid_pdf")).toBe(true);
    });

    it("evaluates email HTML without SEO when output kind is email", () => {
      const result = evaluateHtmlAdapter(
        { executionId: "exec_email", organizationId: "org", outputKind: "email" },
        SAMPLE_HTML,
      );
      expect(result.metrics.some((m) => m.metricId === "html.seo_score")).toBe(false);
      expect(result.metrics.some((m) => m.metricId === "html.accessibility_score")).toBe(true);
    });

    it("evaluates website HTML with SEO metrics", () => {
      const result = evaluateHtmlAdapter(
        { executionId: "exec_web", organizationId: "org", outputKind: "deferred_website" },
        SAMPLE_HTML.replace("Email Campaign", "Landing Page"),
      );
      expect(result.metrics.some((m) => m.metricId === "html.seo_score")).toBe(true);
    });
  });

  describe("evaluation plane orchestrator", () => {
    it("runs static mode for text-only output without artifacts", async () => {
      const { planeResult, enrichment } = await runEvaluationPlane({
        executionId: "exec_plane_text",
        organizationId: "org_plane",
        outputKind: "text",
        preview: "Professional copywriting content for social media product launch campaign.",
        briefObjective: "social copywriting product launch",
      });
      expect(planeResult.planeId).toBe(EVALUATION_PLANE_ID);
      expect(planeResult.planeVersion).toBe(EVALUATION_PLANE_VERSION);
      expect(planeResult.modesExecuted).toContain("static");
      expect(planeResult.modesExecuted).not.toContain("rendered");
      expect(enrichment.evaluationPlaneResult?.metrics.length).toBeGreaterThan(0);
    });

    it("runs rendered mode when artifacts are hydrated", async () => {
      const { planeResult } = await runEvaluationPlane({
        executionId: "exec_plane_img",
        organizationId: "org_plane",
        outputKind: "image",
        mediaArtifactIds: ["art_img"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_img",
            mimeType: "image/png",
            byteSize: PNG_1X1.length,
            bytes: PNG_1X1,
            kind: "image" as const,
          }),
        ]),
      });
      expect(planeResult.modesExecuted).toContain("rendered");
      expect(planeResult.hydratedArtifactCount).toBe(1);
    });

    it("records MODEL_JUDGED metrics from independent evaluator without self-certification", async () => {
      const { planeResult } = await runEvaluationPlane({
        executionId: "exec_judge",
        organizationId: "org_plane",
        outputKind: "image",
        mediaArtifactIds: ["art_img"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_img",
            mimeType: "image/png",
            byteSize: PNG_1X1.length,
            bytes: PNG_1X1,
            kind: "image" as const,
          }),
        ]),
        runIndependentJudgement: async () =>
          Object.freeze({
            dimensionId: "quality.visual_quality",
            score: 72,
            evidence: Object.freeze(["independent mock judge — not generator"]),
            measurementStatus: "MODEL_JUDGED" as const,
            evaluatorModelId: "openai/gpt-4o-mini",
            evaluatorProviderId: "provider.openai",
          }),
      });
      const judged = planeResult.metrics.find((m) => m.measurementStatus === "MODEL_JUDGED");
      expect(judged).toBeDefined();
      expect(judged!.measurementMethod).toBe("independent_visual_judge");
    });

    it("preserves NOT_AUTOMATED for performance on non-runtime modalities", async () => {
      const { enrichment } = await runEvaluationPlane({
        executionId: "exec_perf_na",
        organizationId: "org_plane",
        outputKind: "document",
        mediaArtifactIds: ["art_pdf"],
        hydrateArtifacts: mockHydrated([
          Object.freeze({
            artifactId: "art_pdf",
            mimeType: "application/pdf",
            byteSize: PDF_HEADER.length,
            bytes: PDF_HEADER,
            kind: "pdf" as const,
          }),
        ]),
      });
      expect(enrichment.artifactEvaluation.performance?.evaluated).toBe(false);
      expect(enrichment.artifactEvaluation.performance?.confidence).toBe("not_automated");
    });
  });

  describe("Step 2 integration", () => {
    it("feeds evaluation plane bundle into validateOutputContract", async () => {
      const { enrichment } = await runEvaluationPlane({
        executionId: "exec_step2",
        organizationId: "org_step7",
        outputKind: "text",
        service: "social",
        subtype: "copywriting",
        preview:
          "Professional social copywriting for product launch — audience-aligned messaging with clear CTA.",
        briefObjective: "social copywriting product launch",
      });
      const validation = validateOutputContract({
        organizationId: "org_step7",
        executionId: "exec_step2",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: enrichment.preview,
        briefObjective: "social copywriting product launch",
        artifactEvaluation: enrichment.artifactEvaluation,
      });
      expect(validation).toBeDefined();
      expect(validation!.provenance.some((p) => p.field === "evaluationPlaneId")).toBe(true);
      expect(validation!.provenance.some((p) => p.field === "artifactEvaluatorId")).toBe(true);
    });
  });

  describe("multi-modality benchmark validation", () => {
    it("evaluates text benchmark via same plane as document benchmark", async () => {
      const textCase = getBenchmarkCase("bench.social.copywriting")!;
      const textOutcome = await resolveBenchmarkValidationAsync({
        benchmarkCase: textCase,
        executionOutput: {
          preview:
            "Professional social copywriting deliverable for product launch with audience-aligned messaging and clear call to action.",
          latencyMs: 10,
        },
        organizationId: "org_multi",
        executionId: "exec_text_bench",
        artifactEvaluationDeps: {
          asyncMedia: { blobStorage: {} as never, queue: {} as never } as never,
          artifactsRepo: {} as never,
        },
      });
      expect(textOutcome.kind).toBe("validated");
      if (textOutcome.kind === "validated") {
        expect(textOutcome.validation.provenance.some((p) => p.field === "evaluationPlaneId")).toBe(
          true,
        );
      }
    });
  });

  describe("provenance and fair comparison", () => {
    it("flags incompatible comparison when evaluation plane versions differ", () => {
      const base = {
        benchmarkId: "bench.social.copywriting",
        contractVersion: "1.0.0",
        evaluationPlaneVersion: EVALUATION_PLANE_VERSION,
      };
      const compat = checkComparisonCompatibility(
        base as never,
        { ...base, evaluationPlaneVersion: "step7.0" } as never,
      );
      expect(compat.compatible).toBe(false);
      expect(compat.reasons.some((r) => r.includes("evaluationPlaneVersion"))).toBe(true);
    });

    it("runArtifactEvaluation delegates to evaluation plane with provenance", async () => {
      const enrichment = await runArtifactEvaluation({
        organizationId: "org_delegate",
        executionId: "exec_delegate",
        outputKind: "text",
        preview: "Professional copywriting content for benchmark validation pipeline.",
      });
      expect(enrichment.evaluationPlaneResult?.planeVersion).toBe(EVALUATION_PLANE_VERSION);
      expect(enrichment.artifactEvaluation.provenance.some((p) => p.evaluatorId === EVALUATION_PLANE_ID)).toBe(
        true,
      );
    });
  });

  describe("production safety", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });
  });
});
