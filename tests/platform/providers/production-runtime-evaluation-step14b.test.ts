/**
 * Step 14B — Production runtime + rendered artifact evaluation (deterministic, zero paid API calls).
 */

import {
  runEvaluationPlane,
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
  resolveModalityProfile,
} from "../../../src/platform/os/evaluation/evaluation-plane";
import { runArtifactEvaluation } from "../../../src/platform/os/evaluation/artifact-evaluation";
import {
  resolveProductionValidationAsync,
  ingestProductionEvidenceAndShadow,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryShadowDecisionStore,
  createBenchmarkAsyncMediaPlatform,
  materializeBenchmarkOsArtifacts,
  buildBenchmarkOsMetadata,
  DEFAULT_BENCHMARK_STRATEGY,
  getBenchmarkCase,
  resolveBenchmarkValidationAsync,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import {
  filterObservationalProductionRecords,
  filterControlledComparisonRecords,
} from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import {
  BROWSER_RUNTIME_EVALUATOR_ID,
  BROWSER_RUNTIME_EVALUATOR_VERSION,
  createBrowserRuntimeCheck,
  resolveBrowserRuntimeCapability,
  type BrowserRuntimeCheckResult,
} from "../../../src/platform/os/evaluation/runtime/browser-runtime-evaluator";
import { inspectBrowserDomAccessibility } from "../../../src/platform/os/evaluation/runtime/browser-accessibility-inspector";
import {
  beginExecutionTrace,
  EXECUTION_TRACE_PREFIX,
  recordProductionEvidenceTrace,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import type { HydratedArtifact } from "../../../src/platform/os/evaluation/artifact-evaluation/types";

const WEBSITE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Launch Landing Page</title>
  <meta name="description" content="Professional landing page for product launch campaign." />
</head>
<body>
  <main><h1>Launch</h1><p>Professional landing page content.</p><a href="/about">About</a></main>
</body>
</html>`;

const BAD_A11Y_HTML = `<!DOCTYPE html><html><body><img src="x.png" /><input type="text" /></body></html>`;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PDF_HEADER = Buffer.from("%PDF-1.4\n1 0 obj\n/Type /Page\n/Count 2\n%%EOF");

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

function mockRuntimeSuccess(): BrowserRuntimeCheckResult {
  return Object.freeze({
    evaluated: true,
    status: "COMPLETED",
    startupSucceeded: true,
    runtimeErrors: Object.freeze([]),
    consoleErrors: Object.freeze([]),
    confidence: "measured",
    evidence: Object.freeze(["mock browser runtime success"]),
    performanceReadings: Object.freeze([
      Object.freeze({
        metricId: "perf.ttfb",
        dimension: "quality.performance",
        value: 120,
        unit: "ms",
        threshold: 800,
        measured: true,
        evidence: Object.freeze(["mock ttfb=120ms"]),
      }),
      Object.freeze({
        metricId: "perf.lcp",
        dimension: "quality.performance",
        value: 0,
        unit: "ms",
        measured: false,
        evidence: Object.freeze(["LCP NOT_AUTOMATED in mock"]),
      }),
    ]),
    browserAccessibility: inspectBrowserDomAccessibility(
      Object.freeze({
        lang: "en",
        imagesMissingAlt: Object.freeze([]),
        inputsMissingLabel: Object.freeze([]),
        emptyLinks: Object.freeze([]),
        emptyButtons: Object.freeze([]),
        missingMainLandmark: false,
        missingNavLandmark: false,
        headingHierarchyIssues: Object.freeze([]),
        documentTitle: "Launch",
      }),
    ),
    viewportChecks: Object.freeze(["desktop:1280x800=ok"]),
    routesVerified: Object.freeze(["/about"]),
  });
}

function mockRuntimeFailure(): BrowserRuntimeCheckResult {
  return Object.freeze({
    evaluated: true,
    status: "FAILED",
    startupSucceeded: false,
    runtimeErrors: Object.freeze(["Uncaught ReferenceError: missingVar is not defined"]),
    consoleErrors: Object.freeze(["console error: failed fetch"]),
    confidence: "measured",
    evidence: Object.freeze(["mock browser runtime failure"]),
  });
}

function mockHydratedHtml(html: string, artifactId = "art_html"): () => Promise<readonly HydratedArtifact[]> {
  return async () =>
    Object.freeze([
      Object.freeze({
        artifactId,
        mimeType: "text/html",
        byteSize: Buffer.byteLength(html),
        bytes: Buffer.from(html),
        kind: "html" as const,
        textContent: html,
      }),
    ]);
}

describe("Step 14B — Production runtime + artifact evaluation", () => {
  beforeEach(() => {
    clearValidationCache();
    resetExecutionTracesForTests();
  });

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("reports browser runtime capability unavailable in test environment", () => {
    const cap = resolveBrowserRuntimeCapability();
    expect(cap.available).toBe(false);
    expect(cap.reason).toContain("test");
  });

  it("website runtime success via mock runRuntimeCheck", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_rt_ok",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeSuccess(),
    });
    expect(planeResult.modesExecuted).toContain("runtime");
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("COMPLETED");
    expect(enrichment.artifactEvaluation.runtime?.evaluated).toBe(true);
    expect(enrichment.artifactEvaluation.runtime?.runtimeErrors).toHaveLength(0);
    expect(enrichment.artifactEvaluation.performance?.evaluated).toBe(true);
    expect(enrichment.artifactEvaluation.performance?.ttfbMs).toBe(120);
    expect(enrichment.artifactEvaluation.accessibility?.confidence).toBe("measured");
  });

  it("website runtime failure via mock runRuntimeCheck", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_rt_fail",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeFailure(),
    });
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("FAILED");
    expect(enrichment.artifactEvaluation.runtime?.runtimeErrors.length).toBeGreaterThan(0);
    const runtimeMetric = planeResult.metrics.find((m) => m.metricId === "runtime.errors");
    expect(runtimeMetric?.status).toBe("FAIL");
  });

  it("missing runtime capability yields SKIPPED not PASS", async () => {
    const skipped = await createBrowserRuntimeCheck({
      capability: Object.freeze({ available: false, reason: "puppeteer_not_installed" }),
    })(WEBSITE_HTML);
    expect(skipped.evaluated).toBe(false);
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.skipReason).toBe("puppeteer_not_installed");

    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_rt_skip",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: createBrowserRuntimeCheck({
        capability: Object.freeze({ available: false, reason: "puppeteer_not_installed" }),
      }),
    });
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("SKIPPED");
    expect(planeResult.stageTrace?.runtimeEvaluationReason).toBe("puppeteer_not_installed");
    expect(planeResult.modesExecuted).not.toContain("runtime");
  });

  it("performance metrics measured when browser runtime provides readings", async () => {
    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_perf",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeSuccess(),
    });
    const ttfb = planeResult.metrics.find((m) => m.metricId === "perf.ttfb");
    expect(ttfb?.measurementStatus).toBe("MEASURED");
    expect(ttfb?.evaluatorId).toBe(BROWSER_RUNTIME_EVALUATOR_ID);
    expect(ttfb?.artifactId).toBe("art_html");
  });

  it("performance LCP/CLS/INP remain NOT_AUTOMATED without fabrication", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_perf_na",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeSuccess(),
    });
    const lcp = enrichment.artifactEvaluation.performance?.metrics?.find((m) => m.metricId === "perf.lcp");
    expect(lcp?.measurementStatus).toBe("NOT_AUTOMATED");
    expect(enrichment.artifactEvaluation.performance?.lcpMs).toBeUndefined();
  });

  it("performance NOT_AUTOMATED when no browser runtime for website", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_perf_no_browser",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
    });
    expect(enrichment.artifactEvaluation.performance?.evaluated).toBe(false);
    expect(enrichment.artifactEvaluation.performance?.measurementStatus).toBe("NOT_AUTOMATED");
  });

  it("accessibility MEASURED from browser DOM inspection", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_a11y_measured",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeSuccess(),
    });
    expect(enrichment.artifactEvaluation.accessibility?.confidence).toBe("measured");
    const browserMetric = enrichment.evaluationPlaneResult?.metrics.find(
      (m) => m.metricId === "html.accessibility_browser_score",
    );
    expect(browserMetric?.measurementStatus).toBe("MEASURED");
  });

  it("accessibility falls back to HEURISTIC when browser runtime unavailable", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_a11y_heuristic",
      organizationId: "org_14b",
      outputKind: "email",
      mediaArtifactIds: ["art_email"],
      hydrateArtifacts: mockHydratedHtml(BAD_A11Y_HTML, "art_email"),
    });
    expect(enrichment.artifactEvaluation.accessibility?.confidence).toBe("heuristic");
    expect(enrichment.evaluationPlaneResult?.metrics.some((m) => m.measurementStatus === "HEURISTIC")).toBe(
      true,
    );
  });

  it("rendered artifact evaluation COMPLETED for hydrated website artifacts", async () => {
    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_render",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
    });
    expect(planeResult.modesExecuted).toContain("rendered");
    expect(planeResult.stageTrace?.artifactRender).toBe("COMPLETED");
  });

  it("non-website modality uses same Evaluation Plane (image bytes)", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_image",
      organizationId: "org_14b",
      outputKind: "image",
      mediaArtifactIds: ["art_img"],
      hydrateArtifacts: async () =>
        Object.freeze([
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
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("SKIPPED");
    expect(enrichment.artifactEvaluation.image?.evaluated).toBe(true);
  });

  it("document modality rendered evaluation without runtime", async () => {
    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_doc",
      organizationId: "org_14b",
      outputKind: "document",
      mediaArtifactIds: ["art_pdf"],
      hydrateArtifacts: async () =>
        Object.freeze([
          Object.freeze({
            artifactId: "art_pdf",
            mimeType: "application/pdf",
            byteSize: PDF_HEADER.length,
            bytes: PDF_HEADER,
            kind: "pdf" as const,
          }),
        ]),
    });
    expect(planeResult.stageTrace?.artifactRender).toBe("COMPLETED");
    expect(planeResult.stageTrace?.runtimeEvaluationReason).toBe("runtime_not_applicable_to_modality");
  });

  it("NOT_APPLICABLE dimensions for text modality", () => {
    const profile = resolveModalityProfile("text");
    expect(profile.supportsRuntime).toBe(false);
    expect(profile.notApplicableDimensions.some((d) => d.includes("performance"))).toBe(true);
  });

  it("NOT_AUTOMATED performance for website without runtime execution", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_not_auto",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      preview: WEBSITE_HTML,
    });
    expect(enrichment.artifactEvaluation.performance?.measurementStatus).toBe("NOT_AUTOMATED");
  });

  it("preserves evaluator provenance through plane and bridge", async () => {
    const { enrichment } = await runEvaluationPlane({
      executionId: "exec_prov",
      organizationId: "org_14b",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_web"],
      hydrateArtifacts: mockHydratedHtml(WEBSITE_HTML),
      runRuntimeCheck: async () => mockRuntimeSuccess(),
    });
    expect(enrichment.evaluationPlaneResult?.planeId).toBe(EVALUATION_PLANE_ID);
    expect(enrichment.evaluationPlaneResult?.planeVersion).toBe(EVALUATION_PLANE_VERSION);
    expect(enrichment.artifactEvaluation.provenance.some((p) => p.evaluatorId === EVALUATION_PLANE_ID)).toBe(
      true,
    );
    const perfMetric = enrichment.evaluationPlaneResult?.metrics.find((m) => m.metricId === "perf.ttfb");
    expect(perfMetric?.evaluatorVersion).toBe(BROWSER_RUNTIME_EVALUATOR_VERSION);
  });

  it("production observational evidence remains separate from controlled benchmark", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    const shadow = new InMemoryShadowDecisionStore();
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const metadata = buildBenchmarkOsMetadata({
      benchmarkCase: bc,
      model: textModel,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      organizationId: "org_obs",
      executionId: "exec_obs",
    });
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_obs",
      organizationId: "org_obs",
      metadata,
      runtimeOutput: {
        structured: {
          routes: [{ title: "Launch", files: [{ path: "index.html", content: WEBSITE_HTML }] }],
        },
        content: WEBSITE_HTML,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_obs`,
    });

    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_obs",
        productionExecutionId: "exec_obs",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: WEBSITE_HTML,
        structuredData: {},
        mediaArtifactIds: materialized.mediaArtifactIds,
        providerSuccess: true,
        latencyMs: 10,
        createId: (p) => `${p}_obs`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      {
        recordStore: store,
        shadowStore: shadow,
        artifactEvaluationDeps: Object.freeze({
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
          runRuntimeCheck: async () => mockRuntimeSuccess(),
        }),
      },
    );

    const all = await store.query({ organizationId: "org_obs", limit: 10 });
    const observational = filterObservationalProductionRecords(all);
    const controlled = filterControlledComparisonRecords(all);
    expect(observational.length).toBe(1);
    expect(observational[0]!.evidenceSource).toBe("production");
    expect(observational[0]!.evidenceMode).toBe("observational");
    expect(observational[0]!.validForModelComparison).toBe(false);
    expect(controlled.length).toBe(0);
  });

  it("execution trace reports artifact_render and runtime_evaluation stages", () => {
    const executionId = "exec_trace_14b";
    beginExecutionTrace({
      requestId: "req_14b",
      executionId,
      correlationId: "corr_14b",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      adaptiveRoutingEnabled: false,
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    recordProductionEvidenceTrace({
      executionId,
      providerSuccess: true,
      performanceRecordId: "perfrec_14b",
      contractValidationStatus: "PASS",
      evidenceSource: "production",
      evidenceMode: "observational",
      stageTrace: Object.freeze({
        artifactHydration: "COMPLETED",
        artifactRender: "COMPLETED",
        runtimeEvaluation: "COMPLETED",
        evaluationPlane: "COMPLETED",
        hydratedArtifactCount: 1,
      }),
    });
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(`${EXECUTION_TRACE_PREFIX}`);
    expect(output).toContain("artifact_render=COMPLETED");
    expect(output).toContain("runtime_evaluation=COMPLETED");
    logSpy.mockRestore();
  });

  it("production validation resolver propagates runtime stage trace", async () => {
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const metadata = buildBenchmarkOsMetadata({
      benchmarkCase: bc,
      model: textModel,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      organizationId: "org_resolver",
      executionId: "exec_resolver",
    });
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_resolver",
      organizationId: "org_resolver",
      metadata,
      runtimeOutput: {
        structured: {
          routes: [{ title: "Launch", files: [{ path: "index.html", content: WEBSITE_HTML }] }],
        },
        content: WEBSITE_HTML,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_resolver`,
    });

    const resolved = await resolveProductionValidationAsync({
      context: Object.freeze({
        organizationId: "org_resolver",
        productionExecutionId: "exec_resolver",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: WEBSITE_HTML,
        mediaArtifactIds: materialized.mediaArtifactIds,
        createId: (p) => `${p}_resolver`,
      }),
      artifactEvaluationDeps: Object.freeze({
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
        runRuntimeCheck: async () => mockRuntimeSuccess(),
      }),
    });

    expect(resolved.stageTrace.artifactRender).toBe("COMPLETED");
    expect(resolved.stageTrace.runtimeEvaluation).toBe("COMPLETED");
    expect(resolved.stageTrace.evaluationPlane).toBe("COMPLETED");
    expect(resolved.validation?.provenance.some((p) => p.field === "evaluationPlaneVersion")).toBe(true);
  });

  it("benchmark validation shares runtime evaluation deps without provider calls", async () => {
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const outcome = await resolveBenchmarkValidationAsync({
      benchmarkCase: bc,
      executionOutput: Object.freeze({
        preview: WEBSITE_HTML,
        latencyMs: 5,
      }),
      organizationId: "org_bench",
      executionId: "exec_bench_rt",
      artifactEvaluationDeps: Object.freeze({
        asyncMedia: { blobStorage: {} as never, queue: {} as never } as never,
        artifactsRepo: {} as never,
        runRuntimeCheck: async () => mockRuntimeSuccess(),
      }),
    });
    expect(outcome.kind).toBe("validated");
  });
});
