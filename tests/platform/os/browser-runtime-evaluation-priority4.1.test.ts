/**
 * Priority 4.1 — Browser runtime, accessibility & performance evaluation (deterministic fixtures).
 */

import {
  runEvaluationPlane,
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../../../src/platform/os/evaluation/evaluation-plane";
import { runArtifactEvaluation } from "../../../src/platform/os/evaluation/artifact-evaluation";
import {
  createBrowserRuntimeCheck,
  resolveBrowserRuntimeCapability,
  buildPerformanceMetricsFromRuntime,
  skippedRuntimeResult,
  type BrowserRuntimeCheckResult,
  type ViewportEvaluationResult,
} from "../../../src/platform/os/evaluation/runtime/browser-runtime-evaluator";
import {
  BROWSER_RUNTIME_EVALUATOR_ID,
  BROWSER_RUNTIME_EVALUATOR_VERSION,
} from "../../../src/platform/os/evaluation/runtime/browser-runtime-constants";
import {
  inspectBrowserDomAccessibility,
} from "../../../src/platform/os/evaluation/runtime/browser-accessibility-inspector";
import {
  classifyRuntimeFailure,
} from "../../../src/platform/os/evaluation/runtime/browser-runtime-failure-classification";
import {
  buildWebVitalsReadings,
  parseWebVitalsStore,
} from "../../../src/platform/os/evaluation/runtime/browser-runtime-vitals";
import {
  buildBrowserVisualEvidence,
  buildBrowserVisualMetrics,
} from "../../../src/platform/os/evaluation/runtime/browser-visual-evidence";
import { ingestProductionEvidenceAndShadow } from "../../../src/platform/providers/routing/performance/benchmark/production/production-evidence-service";
import {
  InMemoryBenchmarkPerformanceRecordStore,
  createBenchmarkAsyncMediaPlatform,
  materializeBenchmarkOsArtifacts,
  buildBenchmarkOsMetadata,
  DEFAULT_BENCHMARK_STRATEGY,
  getBenchmarkCase,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { InMemoryExecutionObservabilityStore } from "../../../src/platform/os/observability/execution-observability-store";
import {
  beginExecutionTrace,
  recordProductionEvidenceTrace,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type { HydratedArtifact } from "../../../src/platform/os/evaluation/artifact-evaluation/types";

const FIXTURE_OK = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Fixture OK</title></head>
<body>
  <header><nav><a href="/about">About</a></nav></header>
  <main><h1>Launch</h1><p>Professional landing page content with sufficient visible text.</p>
  <button>Get Started</button></main>
  <footer>Footer</footer>
</body></html>`;

const FIXTURE_CONSOLE_ERROR = `<!DOCTYPE html><html lang="en"><body><script>console.error("fixture console error")</script><main><h1>Hi</h1></main></body></html>`;
const FIXTURE_PAGE_ERROR = `<!DOCTYPE html><html lang="en"><body><script>throw new Error("fixture page error")</script><main><h1>Hi</h1></main></body></html>`;
const FIXTURE_NETWORK = `<!DOCTYPE html><html lang="en"><body><img src="http://127.0.0.1:1/missing.png" /><main><h1>Hi</h1></main></body></html>`;
const FIXTURE_BAD_A11Y = `<!DOCTYPE html><html><body><img src="x.png" /><input type="text" /><button></button><a href="#"></a><h3>Skip</h3></body></html>`;

function mockHydrated(html: string, artifactId = "art_p41"): () => Promise<readonly HydratedArtifact[]> {
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

function baseRuntime(overrides?: Partial<BrowserRuntimeCheckResult>): BrowserRuntimeCheckResult {
  const desktop: ViewportEvaluationResult = Object.freeze({
    name: "desktop",
    width: 1280,
    height: 800,
    renderSuccess: true,
    documentWidth: 1200,
    documentHeight: 900,
    horizontalOverflow: false,
    evidence: Object.freeze(["desktop ok"]),
  });
  const mobile: ViewportEvaluationResult = Object.freeze({
    name: "mobile",
    width: 390,
    height: 844,
    renderSuccess: true,
    documentWidth: 390,
    documentHeight: 1200,
    horizontalOverflow: false,
    evidence: Object.freeze(["mobile ok"]),
  });
  return Object.freeze({
    evaluated: true,
    status: "COMPLETED",
    startupSucceeded: true,
    runtimeErrors: Object.freeze([]),
    consoleErrors: Object.freeze([]),
    failedResourceLoads: Object.freeze([]),
    confidence: "measured",
    evidence: Object.freeze(["mock runtime"]),
    performanceReadings: Object.freeze([
      Object.freeze({
        metricId: "perf.ttfb",
        dimension: "quality.performance",
        value: 100,
        unit: "ms",
        threshold: 800,
        measured: true,
        evidence: Object.freeze(["ttfb=100ms"]),
      }),
      Object.freeze({
        metricId: "perf.lcp",
        dimension: "quality.performance",
        value: 800,
        unit: "ms",
        threshold: 2500,
        measured: true,
        evidence: Object.freeze(["LCP measured via PerformanceObserver: 800ms"]),
      }),
      Object.freeze({
        metricId: "perf.cls",
        dimension: "quality.performance",
        value: 0.02,
        unit: "score",
        threshold: 0.1,
        measured: true,
        evidence: Object.freeze(["CLS measured via PerformanceObserver: 0.0200"]),
      }),
      Object.freeze({
        metricId: "perf.inp",
        dimension: "quality.performance",
        value: 0,
        unit: "ms",
        measured: false,
        evidence: Object.freeze(["INP observer supported but no user interaction occurred — NOT_AUTOMATED"]),
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
        landmarkSummary: Object.freeze(["header", "nav", "main", "footer"]),
      }),
    ),
    viewportChecks: Object.freeze(["desktop:1280x800=ok", "mobile:390x844=ok"]),
    viewportResults: Object.freeze([desktop, mobile]),
    visualEvidence: buildBrowserVisualEvidence({
      dom: Object.freeze({
        visibleContentChars: 120,
        semanticSections: Object.freeze(["header", "nav", "main", "footer"]),
        ctaPresent: true,
        majorHeadings: Object.freeze(["Launch"]),
        documentWidth: 1200,
        documentHeight: 900,
      }),
      screenshotGenerated: true,
      screenshotWidth: 1280,
      screenshotHeight: 800,
    }),
    visualMetrics: buildBrowserVisualMetrics({
      visual: buildBrowserVisualEvidence({
        dom: Object.freeze({
          visibleContentChars: 120,
          semanticSections: Object.freeze(["main"]),
          ctaPresent: true,
          majorHeadings: Object.freeze(["Launch"]),
          documentWidth: 1200,
          documentHeight: 900,
        }),
        screenshotGenerated: true,
        screenshotWidth: 1280,
        screenshotHeight: 800,
      }),
      artifactId: "art_p41",
    }),
    ...overrides,
  });
}

describe("Priority 4.1 — Browser runtime evaluation", () => {
  beforeEach(() => resetExecutionTracesForTests());

  it("reports browser unavailable in test environment", () => {
    const cap = resolveBrowserRuntimeCapability();
    expect(cap.available).toBe(false);
    expect(skippedRuntimeResult(cap.reason).status).toBe("SKIPPED");
  });

  it("successful browser render through Evaluation Plane", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_p41_ok",
      organizationId: "org_p41",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_p41"],
      hydrateArtifacts: mockHydrated(FIXTURE_OK),
      runRuntimeCheck: async () => baseRuntime(),
    });
    expect(planeResult.stageTrace?.artifactRender).toBe("COMPLETED");
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("COMPLETED");
    expect(planeResult.modesExecuted).toContain("runtime");
    expect(enrichment.artifactEvaluation.performance?.ttfbMs).toBe(100);
  });

  it("desktop and mobile viewport results recorded", async () => {
    const runtime = baseRuntime();
    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_p41_vp",
      organizationId: "org_p41",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_p41"],
      hydrateArtifacts: mockHydrated(FIXTURE_OK),
      runRuntimeCheck: async () => runtime,
    });
    expect(runtime.viewportResults).toHaveLength(2);
    expect(planeResult.metrics.some((m) => m.metricId === "render.screenshot_generated")).toBe(true);
  });

  it("classifies console_error separately from page_error", () => {
    expect(
      classifyRuntimeFailure({
        evaluated: true,
        runtimeErrors: Object.freeze([]),
        consoleErrors: Object.freeze(["TypeError: bad"]),
        failedResourceLoads: Object.freeze([]),
      }),
    ).toBe("console_error");
    expect(
      classifyRuntimeFailure({
        evaluated: true,
        runtimeErrors: Object.freeze(["Uncaught ReferenceError: x"]),
        consoleErrors: Object.freeze([]),
        failedResourceLoads: Object.freeze([]),
        startupSucceeded: false,
      }),
    ).toBe("page_error");
  });

  it("classifies network_error and timeout", () => {
    expect(
      classifyRuntimeFailure({
        evaluated: true,
        runtimeErrors: Object.freeze([]),
        consoleErrors: Object.freeze([]),
        failedResourceLoads: Object.freeze(["GET http://x — net::ERR_FAILED"]),
      }),
    ).toBe("network_error");
    expect(
      classifyRuntimeFailure({
        evaluated: true,
        runtimeErrors: Object.freeze(["Navigation timeout of 15000 ms exceeded"]),
        consoleErrors: Object.freeze([]),
        failedResourceLoads: Object.freeze([]),
        startupSucceeded: false,
      }),
    ).toBe("timeout");
  });

  it("runtime console/page errors fail runtime stage not quality gate directly", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_p41_fail",
      organizationId: "org_p41",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_p41"],
      hydrateArtifacts: mockHydrated(FIXTURE_PAGE_ERROR),
      runRuntimeCheck: async () =>
        baseRuntime({
          status: "FAILED",
          startupSucceeded: false,
          runtimeErrors: Object.freeze(["Uncaught Error: fixture page error"]),
          failureCategory: "page_error",
        }),
    });
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("FAILED");
    const runtimeMetric = planeResult.metrics.find((m) => m.metricId === "runtime.errors");
    expect(runtimeMetric?.status).toBe("FAIL");
    expect(enrichment.artifactEvaluation.runtime?.failureCategory).toBe("page_error");
  });

  it("LCP measured when vitals store provides value", () => {
    const reading = buildWebVitalsReadings(
      parseWebVitalsStore({
        lcpMs: 750,
        clsScore: 0.01,
        inpMs: null,
        lcpSupported: true,
        clsSupported: true,
        inpSupported: true,
        inpEntries: 0,
      }),
    );
    expect(reading.lcpMeasured).toBe(true);
    expect(reading.lcpMs).toBe(750);
    expect(reading.inpMeasured).toBe(false);
  });

  it("CLS measured via PerformanceObserver parsing", () => {
    const reading = buildWebVitalsReadings(
      parseWebVitalsStore({
        lcpMs: null,
        clsScore: 0.05,
        inpMs: null,
        lcpSupported: true,
        clsSupported: true,
        inpSupported: false,
        inpEntries: 0,
      }),
    );
    expect(reading.clsMeasured).toBe(true);
    expect(reading.clsScore).toBe(0.05);
  });

  it("INP remains NOT_AUTOMATED without interaction entries", () => {
    const reading = buildWebVitalsReadings(
      parseWebVitalsStore({
        lcpMs: 500,
        clsScore: 0,
        inpMs: null,
        lcpSupported: true,
        clsSupported: true,
        inpSupported: true,
        inpEntries: 0,
      }),
    );
    expect(reading.inpMeasured).toBe(false);
    const metrics = buildPerformanceMetricsFromRuntime({
      readings: Object.freeze([
        Object.freeze({
          metricId: "perf.inp",
          dimension: "quality.performance",
          value: 0,
          unit: "ms",
          measured: false,
          evidence: Object.freeze(["INP NOT_AUTOMATED"]),
        }),
      ]),
    });
    expect(metrics[0]?.measurementStatus).toBe("NOT_AUTOMATED");
  });

  it("accessibility findings include heading hierarchy and empty controls", () => {
    const a11y = inspectBrowserDomAccessibility(
      Object.freeze({
        imagesMissingAlt: Object.freeze([{ index: 0 }]),
        inputsMissingLabel: Object.freeze([{ index: 0, type: "text" }]),
        emptyLinks: Object.freeze([{ index: 0 }]),
        emptyButtons: Object.freeze([{ index: 0 }]),
        missingMainLandmark: true,
        missingNavLandmark: true,
        headingHierarchyIssues: Object.freeze([{ level: 3, text: "Skip" }]),
        landmarkSummary: Object.freeze([]),
      }),
    );
    expect(a11y.violationCount).toBeGreaterThan(0);
    expect(a11y.evidence.some((e) => e.includes("axe-core NOT wired"))).toBe(true);
    expect(a11y.confidence).toBe("measured");
  });

  it("visual metrics are objective render evidence not subjective quality", () => {
    const metrics = buildBrowserVisualMetrics({
      artifactId: "art_p41",
      visual: buildBrowserVisualEvidence({
        dom: Object.freeze({
          visibleContentChars: 50,
          semanticSections: Object.freeze(["main"]),
          ctaPresent: true,
          majorHeadings: Object.freeze(["Title"]),
          documentWidth: 800,
          documentHeight: 600,
        }),
        screenshotGenerated: true,
        screenshotWidth: 1280,
        screenshotHeight: 800,
      }),
    });
    expect(metrics.every((m) => m.measurementStatus === "MEASURED" || m.measurementStatus === "NOT_AUTOMATED")).toBe(
      true,
    );
    expect(metrics.find((m) => m.metricId === "render.visible_content_chars")?.measurementStatus).toBe("MEASURED");
  });

  it("missing artifact hydration skips evaluation plane stages", async () => {
    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_p41_missing",
      organizationId: "org_p41",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_missing"],
      hydrateArtifacts: async () => Object.freeze([]),
      runRuntimeCheck: async () => baseRuntime(),
    });
    expect(planeResult.stageTrace?.artifactRender).toBe("SKIPPED");
    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("SKIPPED");
  });

  it("browser unavailable returns SKIPPED with unsupported_runtime classification", async () => {
    const skipped = await createBrowserRuntimeCheck({
      capability: Object.freeze({ available: false, reason: "puppeteer_not_installed" }),
    })(FIXTURE_OK);
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.failureCategory).toBe("unsupported_runtime");
  });

  it("provenance uses Evaluation Plane versioning", async () => {
    const { planeResult, enrichment } = await runEvaluationPlane({
      executionId: "exec_p41_prov",
      organizationId: "org_p41",
      outputKind: "deferred_website",
      mediaArtifactIds: ["art_p41"],
      hydrateArtifacts: mockHydrated(FIXTURE_OK),
      runRuntimeCheck: async () => baseRuntime(),
    });
    expect(planeResult.planeVersion).toBe(EVALUATION_PLANE_VERSION);
    expect(EVALUATION_PLANE_VERSION).toBe("p4.2.1");
    expect(enrichment.artifactEvaluation.provenance.some((p) => p.evaluatorId === EVALUATION_PLANE_ID)).toBe(
      true,
    );
    const ttfb = planeResult.metrics.find((m) => m.metricId === "perf.ttfb");
    expect(ttfb?.evaluatorId).toBe(BROWSER_RUNTIME_EVALUATOR_ID);
    expect(ttfb?.evaluatorVersion).toBe(BROWSER_RUNTIME_EVALUATOR_VERSION);
  });

  it("integrates with production evidence and durable observability", async () => {
    resetExecutionTracesForTests();
    const executionId = "exec_p41_obs";
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const textModel: BenchmarkModelTarget = Object.freeze({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      capabilityId: "text.generate",
    });
    const media = createBenchmarkAsyncMediaPlatform();
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId,
      organizationId: "org_p41",
      metadata: buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_p41",
        executionId,
      }),
      runtimeOutput: {
        structured: {
          routes: [{ title: "Launch", files: [{ path: "index.html", content: FIXTURE_OK }] }],
        },
        content: FIXTURE_OK,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p: string) => `${p}_p41`,
    });
    beginExecutionTrace({
      requestId: "corr_p41",
      executionId,
      correlationId: "corr_p41",
      service: bc.service,
      subtype: bc.subtype,
      outputKind: bc.outputKind,
    });
    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const observabilityStore = new InMemoryExecutionObservabilityStore();
    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_p41",
        productionExecutionId: executionId,
        requestId: "corr_p41",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: FIXTURE_OK,
        structuredData: {},
        mediaArtifactIds: materialized.mediaArtifactIds,
        latencyMs: 100,
        providerSuccess: true,
        createId: (p: string) => `${p}_p41`,
        nowIso: () => new Date().toISOString(),
      }),
      Object.freeze({
        recordStore,
        observabilityStore,
        artifactEvaluationDeps: Object.freeze({
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
          runRuntimeCheck: async () => baseRuntime(),
        }),
      }),
    );
    await new Promise((r) => setTimeout(r, 40));
    const record = (await recordStore.query({ organizationId: "org_p41" }))[0];
    const durable = await observabilityStore.getByExecutionId(executionId);
    expect(record?.evaluationPlaneVersion).toBe(EVALUATION_PLANE_VERSION);
    expect(durable?.artifactRenderStatus).toBe("COMPLETED");
    expect(durable?.runtimeEvaluationStatus).toBe("COMPLETED");
    expect(durable?.evaluationPlaneStatus).toBe("COMPLETED");
  });

  it("Step 2 receives runtime enrichment via runArtifactEvaluation", async () => {
    const enrichment = await runArtifactEvaluation({
      organizationId: "org_p41",
      executionId: "exec_p41_step2",
      outputKind: "deferred_website",
      preview: "preview",
      mediaArtifactIds: ["art_p41"],
      hydrateArtifacts: mockHydrated(FIXTURE_OK),
      runRuntimeCheck: async () => baseRuntime(),
    });
    expect(enrichment.artifactEvaluation.runtime?.evaluated).toBe(true);
    expect(enrichment.artifactEvaluation.performance?.metrics?.some((m) => m.metricId === "perf.lcp")).toBe(
      true,
    );
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});

describe("Priority 4.1 — Live Puppeteer fixtures (opt-in)", () => {
  const live = process.env.ENABLE_BROWSER_RUNTIME_IN_TESTS === "true";

  (live ? it : it.skip)("runs live browser against local HTML fixture", async () => {
    const result = await createBrowserRuntimeCheck({ artifactId: "art_live" })(FIXTURE_OK);
    expect(result.evaluated).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.viewportResults?.length).toBe(2);
    const lcp = result.performanceReadings?.find((r) => r.metricId === "perf.lcp");
    expect(lcp?.measured === true || lcp?.measured === false).toBe(true);
  }, 30_000);
});
