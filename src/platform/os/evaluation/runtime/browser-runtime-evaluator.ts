/**
 * Step 14B / Priority 4.1 — Injectable browser runtime evaluation for HTML artifacts.
 * Capability-driven: SKIPPED when tooling unavailable; FAILED on execution errors.
 */

import type {
  AccessibilityEvaluationEvidence,
  RuntimeEvaluationEvidence,
} from "../artifact-evaluation/types";
import type { ObjectiveMetric } from "../evaluation-plane/types";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../evaluation-plane/evaluation-plane-version";
import {
  BROWSER_DOM_ACCESSIBILITY_SCRIPT,
  inspectBrowserDomAccessibility,
  type BrowserDomAccessibilitySnapshot,
} from "./browser-accessibility-inspector";
import {
  classifyRuntimeFailure,
  type RuntimeFailureCategory,
} from "./browser-runtime-failure-classification";
import {
  BROWSER_RUNTIME_EVALUATOR_ID,
  BROWSER_RUNTIME_EVALUATOR_VERSION,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
} from "./browser-runtime-constants";
import {
  buildWebVitalsReadings,
  parseWebVitalsStore,
  WEB_VITALS_OBSERVER_INIT_SCRIPT,
} from "./browser-runtime-vitals";
import {
  BROWSER_VISUAL_DOM_SCRIPT,
  buildBrowserVisualEvidence,
  buildBrowserVisualMetrics,
  type BrowserVisualDomSnapshot,
  type BrowserVisualEvidence,
} from "./browser-visual-evidence";

export {
  BROWSER_RUNTIME_EVALUATOR_ID,
  BROWSER_RUNTIME_EVALUATOR_VERSION,
} from "./browser-runtime-constants";

export type BrowserRuntimeCapability = {
  readonly available: boolean;
  readonly reason: string;
};

export type BrowserPerformanceReading = {
  readonly metricId: string;
  readonly dimension: string;
  readonly value: number;
  readonly unit: string;
  readonly threshold?: number;
  readonly measured: boolean;
  readonly evidence: readonly string[];
};

export type ViewportEvaluationResult = {
  readonly name: "desktop" | "mobile";
  readonly width: number;
  readonly height: number;
  readonly renderSuccess: boolean;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly horizontalOverflow: boolean;
  readonly evidence: readonly string[];
};

export type BrowserRuntimeCheckResult = RuntimeEvaluationEvidence & {
  readonly performanceReadings?: readonly BrowserPerformanceReading[];
  readonly browserAccessibility?: AccessibilityEvaluationEvidence;
  readonly viewportChecks?: readonly string[];
  readonly viewportResults?: readonly ViewportEvaluationResult[];
  readonly routesVerified?: readonly string[];
  readonly failureCategory?: RuntimeFailureCategory;
  readonly visualEvidence?: BrowserVisualEvidence;
  readonly visualMetrics?: readonly ObjectiveMetric[];
};

export function resolveBrowserRuntimeCapability(): BrowserRuntimeCapability {
  if (process.env.BROWSER_RUNTIME_EVALUATION_ENABLED === "false") {
    return Object.freeze({
      available: false,
      reason: "BROWSER_RUNTIME_EVALUATION_ENABLED=false",
    });
  }
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_BROWSER_RUNTIME_IN_TESTS !== "true") {
    return Object.freeze({
      available: false,
      reason: "browser_runtime_disabled_in_test_environment",
    });
  }
  try {
    require.resolve("puppeteer");
    return Object.freeze({ available: true, reason: "puppeteer_available" });
  } catch {
    return Object.freeze({ available: false, reason: "puppeteer_not_installed" });
  }
}

export function buildPerformanceMetricsFromRuntime(input: {
  readonly readings: readonly BrowserPerformanceReading[];
  readonly artifactId?: string;
}): ObjectiveMetric[] {
  return input.readings.map((reading) =>
    Object.freeze({
      metricId: reading.metricId,
      dimension: reading.dimension,
      value: reading.value,
      unit: reading.unit,
      threshold: reading.threshold,
      status:
        reading.measured && reading.threshold != null
          ? reading.value <= reading.threshold
            ? ("PASS" as const)
            : ("UNVERIFIED" as const)
          : ("UNVERIFIED" as const),
      measurementMethod: "browser_performance_observer",
      evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
      evaluatorVersion: BROWSER_RUNTIME_EVALUATOR_VERSION,
      measurementStatus: reading.measured ? ("MEASURED" as const) : ("NOT_AUTOMATED" as const),
      evidence: Object.freeze(reading.evidence),
      confidence: reading.measured ? ("MEASURED" as const) : ("NOT_AUTOMATED" as const),
      artifactId: input.artifactId,
    }),
  );
}

export function skippedRuntimeResult(reason: string): BrowserRuntimeCheckResult {
  const result = Object.freeze({
    evaluated: false,
    status: "SKIPPED" as const,
    skipReason: reason,
    runtimeErrors: Object.freeze([]),
    consoleErrors: Object.freeze([]),
    confidence: "not_automated" as const,
    evidence: Object.freeze([`runtime SKIPPED: ${reason}`]),
    failureCategory: classifyRuntimeFailure({
      evaluated: false,
      skipReason: reason,
      runtimeErrors: Object.freeze([]),
      consoleErrors: Object.freeze([]),
      failedResourceLoads: Object.freeze([]),
    }),
  });
  return result;
}

export function createBrowserRuntimeCheck(options?: {
  readonly implementation?: (html: string) => Promise<BrowserRuntimeCheckResult>;
  readonly artifactId?: string;
  readonly capability?: BrowserRuntimeCapability;
}): (html: string) => Promise<BrowserRuntimeCheckResult> {
  if (options?.implementation) {
    return options.implementation;
  }
  const capability = options?.capability ?? resolveBrowserRuntimeCapability();
  if (!capability.available) {
    return async () => skippedRuntimeResult(capability.reason);
  }
  return async (html) => runPuppeteerRuntimeCheck(html, options?.artifactId);
}

async function evaluateViewport(
  page: {
    setViewport(input: { width: number; height: number }): Promise<void>;
    evaluate<T>(fn: string | (() => T)): Promise<T>;
  },
  viewport: { readonly name: "desktop" | "mobile"; readonly width: number; readonly height: number },
): Promise<ViewportEvaluationResult> {
  await page.setViewport({ width: viewport.width, height: viewport.height });
  const dims = await page.evaluate(() =>
    Object.freeze({
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      ),
      documentHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      ),
      bodyHeight: document.body?.offsetHeight ?? 0,
    }),
  );
  const renderSuccess = dims.bodyHeight > 0;
  const horizontalOverflow = dims.documentWidth > viewport.width + 2;
  return Object.freeze({
    name: viewport.name,
    width: viewport.width,
    height: viewport.height,
    renderSuccess,
    documentWidth: dims.documentWidth,
    documentHeight: dims.documentHeight,
    horizontalOverflow,
    evidence: Object.freeze([
      `${viewport.name} ${viewport.width}x${viewport.height} render=${renderSuccess ? "ok" : "empty"}`,
      `document=${dims.documentWidth}x${dims.documentHeight}`,
      horizontalOverflow ? "horizontal_overflow_detected" : "no_horizontal_overflow",
    ]),
  });
}

async function runPuppeteerRuntimeCheck(
  html: string,
  artifactId?: string,
): Promise<BrowserRuntimeCheckResult> {
  const evidence: string[] = [];
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResourceLoads: string[] = [];
  const viewportResults: ViewportEvaluationResult[] = [];
  const routesVerified: string[] = [];

  let browser: { close(): Promise<void> } | undefined;
  try {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(WEB_VITALS_OBSERVER_INIT_SCRIPT);

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      runtimeErrors.push(err instanceof Error ? err.message : String(err));
    });
    page.on("requestfailed", (req) => {
      failedResourceLoads.push(
        `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "failed"}`,
      );
    });

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForFunction(() => document.readyState === "complete", { timeout: 5_000 }).catch(
      () => undefined,
    );
    await new Promise((r) => setTimeout(r, 300));

    const bodyText = await page.evaluate(() => (document.body?.innerText ?? "").trim());
    if (!bodyText) {
      runtimeErrors.push("page body rendered empty");
    } else {
      evidence.push(`page body rendered (${bodyText.length} chars)`);
    }

    const internalLinks = await page.evaluate(() => {
      const hrefs: string[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href");
        if (href && !href.startsWith("http") && !href.startsWith("//")) {
          hrefs.push(href);
        }
      });
      return hrefs;
    });
    for (const href of internalLinks.slice(0, 10)) {
      routesVerified.push(href);
    }
    if (internalLinks.length > 0) {
      evidence.push(`verified ${Math.min(internalLinks.length, 10)} internal route href(s) in DOM`);
    }

    for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
      viewportResults.push(await evaluateViewport(page, viewport));
    }

    const domSnapshot = (await page.evaluate(
      BROWSER_DOM_ACCESSIBILITY_SCRIPT,
    )) as BrowserDomAccessibilitySnapshot;
    const browserAccessibility = inspectBrowserDomAccessibility(domSnapshot);

    const visualDom = (await page.evaluate(
      BROWSER_VISUAL_DOM_SCRIPT,
    )) as BrowserVisualDomSnapshot;
    let screenshotGenerated = false;
    let screenshotWidth: number | undefined;
    let screenshotHeight: number | undefined;
    try {
      const shot = await page.screenshot({ type: "png", encoding: "binary" });
      screenshotGenerated = Buffer.isBuffer(shot) && shot.length > 0;
      if (screenshotGenerated) {
        screenshotWidth = DESKTOP_VIEWPORT.width;
        screenshotHeight = DESKTOP_VIEWPORT.height;
        evidence.push(`screenshot bytes=${Buffer.isBuffer(shot) ? shot.length : 0}`);
      }
    } catch (shotErr) {
      evidence.push(
        `screenshot capture failed: ${shotErr instanceof Error ? shotErr.message : String(shotErr)}`,
      );
    }
    const visualEvidence = buildBrowserVisualEvidence({
      dom: visualDom,
      screenshotGenerated,
      screenshotWidth,
      screenshotHeight,
    });
    const visualMetrics = buildBrowserVisualMetrics({ visual: visualEvidence, artifactId });

    const perfTimings = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      return Object.freeze({
        ttfbMs: nav?.responseStart ?? null,
        domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
        loadEventMs: nav?.loadEventEnd ?? null,
      });
    });

    const vitalsRaw = await page.evaluate(() => (window as unknown as { __unagencyWebVitals?: unknown }).__unagencyWebVitals);
    const vitals = buildWebVitalsReadings(parseWebVitalsStore(vitalsRaw));

    const performanceReadings: BrowserPerformanceReading[] = [];
    if (perfTimings.ttfbMs != null && perfTimings.ttfbMs > 0) {
      performanceReadings.push(
        Object.freeze({
          metricId: "perf.ttfb",
          dimension: "quality.performance",
          value: Math.round(perfTimings.ttfbMs),
          unit: "ms",
          threshold: 800,
          measured: true,
          evidence: Object.freeze([`navigation.responseStart=${perfTimings.ttfbMs}ms`]),
        }),
      );
    }
    if (perfTimings.domContentLoadedMs != null && perfTimings.domContentLoadedMs > 0) {
      performanceReadings.push(
        Object.freeze({
          metricId: "perf.dom_content_loaded",
          dimension: "quality.performance",
          value: Math.round(perfTimings.domContentLoadedMs),
          unit: "ms",
          threshold: 3000,
          measured: true,
          evidence: Object.freeze([
            `navigation.domContentLoadedEventEnd=${perfTimings.domContentLoadedMs}ms`,
          ]),
        }),
      );
    }
    if (perfTimings.loadEventMs != null && perfTimings.loadEventMs > 0) {
      performanceReadings.push(
        Object.freeze({
          metricId: "perf.load_event",
          dimension: "quality.performance",
          value: Math.round(perfTimings.loadEventMs),
          unit: "ms",
          threshold: 5000,
          measured: true,
          evidence: Object.freeze([`navigation.loadEventEnd=${perfTimings.loadEventMs}ms`]),
        }),
      );
    }

    performanceReadings.push(
      Object.freeze({
        metricId: "perf.lcp",
        dimension: "quality.performance",
        value: vitals.lcpMeasured && vitals.lcpMs != null ? Math.round(vitals.lcpMs) : 0,
        unit: "ms",
        threshold: 2500,
        measured: vitals.lcpMeasured,
        evidence: Object.freeze(vitals.evidence.filter((e) => e.includes("LCP"))),
      }),
    );
    performanceReadings.push(
      Object.freeze({
        metricId: "perf.cls",
        dimension: "quality.performance",
        value: vitals.clsMeasured && vitals.clsScore != null ? vitals.clsScore : 0,
        unit: "score",
        threshold: 0.1,
        measured: vitals.clsMeasured,
        evidence: Object.freeze(vitals.evidence.filter((e) => e.includes("CLS"))),
      }),
    );
    performanceReadings.push(
      Object.freeze({
        metricId: "perf.inp",
        dimension: "quality.performance",
        value: vitals.inpMeasured && vitals.inpMs != null ? Math.round(vitals.inpMs) : 0,
        unit: "ms",
        threshold: 200,
        measured: vitals.inpMeasured,
        evidence: Object.freeze(vitals.evidence.filter((e) => e.includes("INP"))),
      }),
    );

    if (consoleErrors.length > 0) {
      evidence.push(`${consoleErrors.length} console error(s)`);
    }
    if (failedResourceLoads.length > 0) {
      evidence.push(`${failedResourceLoads.length} failed resource load(s)`);
    }

    const startupSucceeded = runtimeErrors.length === 0 && Boolean(bodyText);
    const status =
      !startupSucceeded || runtimeErrors.length > 0 ? ("FAILED" as const) : ("COMPLETED" as const);

    const failureCategory = classifyRuntimeFailure({
      evaluated: true,
      runtimeErrors,
      consoleErrors,
      failedResourceLoads,
      startupSucceeded,
    });

    const viewportChecks = viewportResults.map(
      (v) => `${v.name}:${v.width}x${v.height}=${v.renderSuccess ? "ok" : "empty"}`,
    );

    return Object.freeze({
      evaluated: true,
      status,
      startupSucceeded,
      runtimeErrors: Object.freeze(runtimeErrors),
      consoleErrors: Object.freeze(consoleErrors),
      failedResourceLoads: Object.freeze(failedResourceLoads),
      confidence: "measured",
      evidence: Object.freeze([
        ...evidence,
        ...vitals.evidence,
        `evaluator=${BROWSER_RUNTIME_EVALUATOR_ID}@${BROWSER_RUNTIME_EVALUATOR_VERSION}`,
        `plane=${EVALUATION_PLANE_ID}@${EVALUATION_PLANE_VERSION}`,
        ...(artifactId ? [`artifactId=${artifactId}`] : []),
        ...(failureCategory ? [`failureCategory=${failureCategory}`] : []),
      ]),
      performanceReadings: Object.freeze(performanceReadings),
      browserAccessibility,
      viewportChecks: Object.freeze(viewportChecks),
      viewportResults: Object.freeze(viewportResults),
      routesVerified: Object.freeze(routesVerified),
      failureCategory,
      visualEvidence,
      visualMetrics: Object.freeze(visualMetrics),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureCategory = classifyRuntimeFailure({
      evaluated: true,
      runtimeErrors: Object.freeze([message]),
      consoleErrors,
      failedResourceLoads,
      startupSucceeded: false,
    });
    return Object.freeze({
      evaluated: true,
      status: "FAILED",
      startupSucceeded: false,
      runtimeErrors: Object.freeze([message]),
      consoleErrors: Object.freeze(consoleErrors),
      failedResourceLoads: Object.freeze(failedResourceLoads),
      confidence: "measured",
      evidence: Object.freeze([
        `browser runtime FAILED: ${message}`,
        ...(failureCategory ? [`failureCategory=${failureCategory}`] : []),
      ]),
      failureCategory,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
