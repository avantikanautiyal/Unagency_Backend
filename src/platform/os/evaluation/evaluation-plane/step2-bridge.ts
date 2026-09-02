/**
 * Step 7 / 14B — Converts Evaluation Plane results into Step 6 ArtifactEvaluationBundle
 * for Step 2 validator consumption (no duplicate validation engine).
 */

import type { ArtifactEvaluationBundle } from "../artifact-evaluation/types";
import {
  ARTIFACT_EVALUATION_VERSION,
  ARTIFACT_EVALUATOR_ID,
} from "../artifact-evaluation/artifact-evaluation-version";
import type { HydratedArtifact } from "../artifact-evaluation/types";
import type { EvaluationPlaneResult, EvaluationContext, ObjectiveMetric } from "./types";
import type { ModalityAdapterResult } from "./adapters/modality-adapters";
import type { BrowserRuntimeCheckResult } from "../runtime/browser-runtime-evaluator";
import { EVALUATION_PLANE_ID, EVALUATION_PLANE_VERSION } from "./evaluation-plane-version";

function findMetric(metrics: readonly ObjectiveMetric[], id: string): ObjectiveMetric | undefined {
  return metrics.find((m) => m.metricId === id || m.dimension === id);
}

function mapPerformanceEvidence(
  metrics: readonly ObjectiveMetric[],
  profileSupportsRuntime: boolean,
): ArtifactEvaluationBundle["performance"] {
  const perfMetrics = metrics.filter((m) => m.metricId.startsWith("perf."));
  if (perfMetrics.length === 0) {
    return Object.freeze({
      evaluated: false,
      score: 0,
      confidence: "not_automated" as const,
      measurementStatus: profileSupportsRuntime ? "NOT_AUTOMATED" : "NOT_APPLICABLE",
      evidence: Object.freeze(
        profileSupportsRuntime
          ? ["performance metrics require browser runtime — NOT_AUTOMATED"]
          : ["performance not applicable to this output kind"],
      ),
    });
  }

  const measured = perfMetrics.filter((m) => m.measurementStatus === "MEASURED");
  const ttfb = perfMetrics.find((m) => m.metricId === "perf.ttfb");
  const dcl = perfMetrics.find((m) => m.metricId === "perf.dom_content_loaded");
  const load = perfMetrics.find((m) => m.metricId === "perf.load_event");
  const lcp = perfMetrics.find((m) => m.metricId === "perf.lcp");
  const cls = perfMetrics.find((m) => m.metricId === "perf.cls");
  const inp = perfMetrics.find((m) => m.metricId === "perf.inp");

  const score =
    measured.length > 0
      ? Math.round(
          measured.reduce((sum, m) => {
            if (typeof m.value !== "number" || m.threshold == null) return sum;
            return sum + (m.value <= m.threshold ? 100 : Math.max(0, 100 - (m.value / m.threshold) * 50));
          }, 0) / measured.length,
        )
      : 0;

  return Object.freeze({
    evaluated: measured.length > 0,
    ttfbMs: typeof ttfb?.value === "number" ? ttfb.value : undefined,
    domContentLoadedMs: typeof dcl?.value === "number" ? dcl.value : undefined,
    loadEventMs: typeof load?.value === "number" ? load.value : undefined,
    lcpMs: typeof lcp?.value === "number" && lcp.measurementStatus === "MEASURED" ? lcp.value : undefined,
    clsScore: typeof cls?.value === "number" && cls.measurementStatus === "MEASURED" ? cls.value : undefined,
    inpMs: typeof inp?.value === "number" && inp.measurementStatus === "MEASURED" ? inp.value : undefined,
    score,
    confidence: measured.length > 0 ? ("measured" as const) : ("not_automated" as const),
    measurementStatus: measured.length > 0 ? ("MEASURED" as const) : ("NOT_AUTOMATED" as const),
    metrics: Object.freeze(
      perfMetrics.map((m) =>
        Object.freeze({
          metricId: m.metricId,
          value: typeof m.value === "number" ? m.value : 0,
          unit: m.unit ?? "",
          threshold: m.threshold,
          measurementStatus:
            m.measurementStatus === "MEASURED"
              ? ("MEASURED" as const)
              : m.measurementStatus === "NOT_APPLICABLE"
                ? ("NOT_APPLICABLE" as const)
                : ("NOT_AUTOMATED" as const),
          evidence: m.evidence,
        }),
      ),
    ),
    evidence: Object.freeze([
      ...measured.flatMap((m) => m.evidence),
      ...perfMetrics
        .filter((m) => m.measurementStatus === "NOT_AUTOMATED")
        .flatMap((m) => m.evidence),
    ]),
  });
}

export function bridgeToArtifactEvaluationBundle(input: {
  readonly ctx: EvaluationContext;
  readonly planeResult: EvaluationPlaneResult;
  readonly adapterResult: ModalityAdapterResult;
  readonly hydrated?: readonly HydratedArtifact[];
  readonly nowIso: () => string;
  readonly runtimeResult?: BrowserRuntimeCheckResult;
}): ArtifactEvaluationBundle {
  const { adapterResult, planeResult, ctx, hydrated = [], runtimeResult } = input;
  const metrics = adapterResult.metrics;
  const m = (id: string) => findMetric(metrics, id);

  const seoMetric = m("quality.seo") ?? m("html.seo_score");
  const browserA11yMetric = m("html.accessibility_browser_score");
  const heuristicA11yMetric = m("quality.accessibility") ?? m("html.accessibility_score");
  const a11yMetric = browserA11yMetric ?? heuristicA11yMetric;
  const hierarchyMetric = m("quality.visual_hierarchy") ?? m("html.visual_hierarchy");
  const visualMetric =
    m("quality.visual_quality") ??
    m("html.visual_quality") ??
    m("image.visual_quality") ??
    m("document.layout_score") ??
    m("presentation.layout_score");
  const brandMetric = m("quality.brand_adherence") ?? m("html.brand_adherence");

  const visualDimensions = [hierarchyMetric, visualMetric].filter(Boolean) as ObjectiveMetric[];

  const pdfArtifact = hydrated.find((h) => h.kind === "pdf");
  const pptxArtifact = hydrated.find((h) => h.kind === "pptx");
  const imageArtifact = hydrated.find((h) => h.kind === "image");
  const videoArtifact = hydrated.find(
    (h) => h.kind === "other" && h.mimeType.includes("video"),
  );

  const browserA11y = runtimeResult?.browserAccessibility;
  const heuristicA11y =
    heuristicA11yMetric && heuristicA11yMetric.measurementStatus === "HEURISTIC"
      ? Object.freeze({
          evaluated: true,
          violationCount: heuristicA11yMetric.status === "FAIL" ? 1 : 0,
          criticalCount: heuristicA11yMetric.status === "FAIL" ? 1 : 0,
          seriousCount: 0,
          violations: Object.freeze([]),
          score: typeof heuristicA11yMetric.value === "number" ? heuristicA11yMetric.value : 0,
          confidence: "heuristic" as const,
          evidence: heuristicA11yMetric.evidence,
        })
      : undefined;

  const accessibilityBundle =
    browserA11y ??
    (a11yMetric
      ? Object.freeze({
          evaluated: a11yMetric.measurementStatus !== "NOT_APPLICABLE",
          violationCount: a11yMetric.status === "FAIL" ? 1 : 0,
          criticalCount: a11yMetric.status === "FAIL" ? 1 : 0,
          seriousCount: 0,
          violations: Object.freeze([]),
          score: typeof a11yMetric.value === "number" ? a11yMetric.value : 0,
          confidence:
            a11yMetric.measurementStatus === "MEASURED"
              ? ("measured" as const)
              : a11yMetric.measurementStatus === "HEURISTIC"
                ? ("heuristic" as const)
                : ("not_automated" as const),
          evidence: Object.freeze([
            ...a11yMetric.evidence,
            ...(heuristicA11y && browserA11y
              ? ["heuristic fallback preserved separately"]
              : []),
          ]),
        })
      : undefined);

  const runtimeExecuted = planeResult.modesExecuted.includes("runtime");
  const runtimeSkipped = runtimeResult?.status === "SKIPPED" || runtimeResult?.evaluated === false;

  return Object.freeze({
    htmlContent: adapterResult.htmlContent,
    seo: seoMetric
      ? Object.freeze({
          evaluated: seoMetric.measurementStatus !== "NOT_APPLICABLE",
          findings: Object.freeze([]),
          score: typeof seoMetric.value === "number" ? seoMetric.value : 0,
          confidence: seoMetric.measurementStatus === "MEASURED" ? "measured" : "heuristic",
          evidence: seoMetric.evidence,
        })
      : undefined,
    accessibility: accessibilityBundle,
    visual:
      visualDimensions.length > 0
        ? Object.freeze({
            evaluated: true,
            dimensions: Object.freeze(
              visualDimensions.map((d) =>
                Object.freeze({
                  dimensionId: d.dimension,
                  score: typeof d.value === "number" ? d.value : 0,
                  confidence:
                    d.measurementStatus === "MEASURED"
                      ? ("measured" as const)
                      : d.measurementStatus === "MODEL_JUDGED"
                        ? ("estimated" as const)
                        : ("heuristic" as const),
                  evidence: d.evidence,
                }),
              ),
            ),
            confidence:
              visualMetric?.measurementStatus === "MEASURED" ? "measured" : "heuristic",
          })
        : undefined,
    brandAdherence: brandMetric
      ? Object.freeze({
          evaluated: true,
          score: typeof brandMetric.value === "number" ? brandMetric.value : 0,
          matchedColors: Object.freeze([]),
          matchedTerms: Object.freeze([]),
          confidence: "heuristic" as const,
          evidence: brandMetric.evidence,
        })
      : undefined,
    document: m("document.valid_pdf") || m("document.valid_docx")
      ? Object.freeze({
          evaluated: true,
          isValidPdf: (m("document.valid_pdf")?.value ?? false) === true,
          isValidDocx: m("document.valid_docx")?.value === true ? true : undefined,
          pageCount:
            typeof m("document.page_count")?.value === "number"
              ? (m("document.page_count")!.value as number)
              : undefined,
          byteSize: pdfArtifact?.byteSize ?? pptxArtifact?.byteSize ?? 0,
          textLength:
            typeof m("document.text_present")?.value === "boolean" &&
            m("document.text_present")!.value === true
              ? 1
              : undefined,
          confidence: "measured" as const,
          evidence: (m("document.valid_pdf") ?? m("document.valid_docx"))!.evidence,
        })
      : undefined,
    presentation:
      m("presentation.valid_pdf") ||
      m("presentation.valid_pptx") ||
      m("presentation.slide_count")
        ? Object.freeze({
            evaluated: true,
            isValidPdf: (m("presentation.valid_pdf")?.value ?? false) === true,
            isValidPptx: (m("presentation.valid_pptx")?.value ?? false) === true,
            slideCount:
              typeof m("presentation.slide_count")?.value === "number"
                ? (m("presentation.slide_count")!.value as number)
                : undefined,
            pageCount:
              typeof m("presentation.page_count")?.value === "number"
                ? (m("presentation.page_count")!.value as number)
                : undefined,
            emptySlideCount:
              typeof m("presentation.empty_slides")?.value === "number"
                ? (m("presentation.empty_slides")!.value as number)
                : undefined,
            byteSize: pptxArtifact?.byteSize ?? pdfArtifact?.byteSize ?? 0,
            confidence: "measured" as const,
            evidence: (
              m("presentation.valid_pptx") ??
              m("presentation.valid_pdf") ??
              m("presentation.slide_count")
            )!.evidence,
          })
        : undefined,
    email: m("email.html_valid")
      ? Object.freeze({
          evaluated: true,
          htmlValid: m("email.html_valid")!.value === true,
          subjectPresent: m("email.subject_present")?.value === true,
          contentPresent: m("email.content_present")?.value === true,
          ctaPresent: m("email.cta_present")?.value === true,
          linkCount: 0,
          imageCount: 0,
          brokenImageRefs:
            typeof m("email.broken_image_refs")?.value === "number"
              ? (m("email.broken_image_refs")!.value as number)
              : 0,
          viewportMeta: m("email.viewport_meta")?.value === true,
          tableLayout: false,
          visibleTextLength: 0,
          confidence: "measured" as const,
          evidence: m("email.html_valid")!.evidence,
        })
      : undefined,
    image: m("image.width")
      ? Object.freeze({
          evaluated: true,
          width:
            typeof m("image.width")!.value === "number"
              ? (m("image.width")!.value as number)
              : undefined,
          height:
            typeof m("image.height")?.value === "number"
              ? (m("image.height")!.value as number)
              : undefined,
          byteSize: imageArtifact?.byteSize ?? 0,
          integrityOk: m("image.integrity")?.value !== false,
          format: typeof m("image.format")?.value === "string" ? m("image.format")!.value as string : undefined,
          aspectRatio:
            typeof m("image.aspect_ratio")?.value === "string"
              ? (m("image.aspect_ratio")!.value as string)
              : undefined,
          confidence: "measured" as const,
          evidence: m("image.width")!.evidence,
        })
      : undefined,
    video: m("video.readable")
      ? Object.freeze({
          evaluated: true,
          isReadable: m("video.readable")!.value === true,
          byteSize: videoArtifact?.byteSize ?? 0,
          containerFormat:
            typeof m("video.container_format")?.value === "string"
              ? (m("video.container_format")!.value as string)
              : undefined,
          durationSec:
            typeof m("video.duration_sec")?.value === "number"
              ? (m("video.duration_sec")!.value as number)
              : undefined,
          width: undefined,
          height: undefined,
          hasVideoStream: m("video.stream_video")?.value === true,
          hasAudioStream: m("video.stream_audio")?.value === true,
          confidence: "measured" as const,
          evidence: m("video.readable")!.evidence,
        })
      : undefined,
    build: Object.freeze({
      evaluated: ctx.buildSucceeded !== undefined,
      buildSucceeded: ctx.buildSucceeded,
      buildOutput: ctx.buildOutput,
      confidence: ctx.buildSucceeded !== undefined ? ("measured" as const) : ("not_automated" as const),
      evidence: Object.freeze(
        ctx.buildSucceeded != null
          ? [ctx.buildOutput ?? String(ctx.buildSucceeded)]
          : ["no build evidence"],
      ),
    }),
    runtime: runtimeResult
      ? Object.freeze({
          evaluated: runtimeResult.evaluated,
          status: runtimeResult.status,
          skipReason: runtimeResult.skipReason,
          startupSucceeded: runtimeResult.startupSucceeded,
          runtimeErrors: Object.freeze([...runtimeResult.runtimeErrors]),
          consoleErrors: Object.freeze([...runtimeResult.consoleErrors]),
          failedResourceLoads: Object.freeze([...(runtimeResult.failedResourceLoads ?? [])]),
          viewportChecks: Object.freeze([...(runtimeResult.viewportChecks ?? [])]),
          viewportResults: Object.freeze([...(runtimeResult.viewportResults ?? [])]),
          routesVerified: Object.freeze([...(runtimeResult.routesVerified ?? [])]),
          confidence: runtimeResult.confidence,
          evidence: runtimeResult.evidence,
          ...(runtimeResult.failureCategory
            ? { failureCategory: runtimeResult.failureCategory }
            : {}),
        })
      : Object.freeze({
          evaluated: runtimeExecuted,
          runtimeErrors: Object.freeze([]),
          consoleErrors: Object.freeze([]),
          confidence: runtimeExecuted
            ? ("measured" as const)
            : runtimeSkipped
              ? ("not_automated" as const)
              : ("not_automated" as const),
          evidence: Object.freeze(
            planeResult.modality.supportsRuntime
              ? runtimeExecuted
                ? ["runtime observation executed"]
                : [
                    planeResult.stageTrace?.runtimeEvaluationReason ??
                      "runtime evaluation not executed",
                  ]
              : ["runtime not applicable to this output kind"],
          ),
        }),
    performance: mapPerformanceEvidence(metrics, planeResult.modality.supportsRuntime),
    provenance: Object.freeze([
      Object.freeze({
        evaluatorId: EVALUATION_PLANE_ID,
        evaluatorVersion: EVALUATION_PLANE_VERSION,
        evaluationMethod: "evaluation_plane",
        evaluationTimestamp: input.nowIso(),
        artifactIds: Object.freeze(
          metrics.map((x) => x.artifactId).filter(Boolean) as string[],
        ),
        confidence: "measured" as const,
        notes: `artifact_bridge=${ARTIFACT_EVALUATOR_ID}@${ARTIFACT_EVALUATION_VERSION}`,
      }),
      Object.freeze({
        evaluatorId: ARTIFACT_EVALUATOR_ID,
        evaluatorVersion: ARTIFACT_EVALUATION_VERSION,
        evaluationMethod: "step2_bridge",
        evaluationTimestamp: input.nowIso(),
        artifactIds: Object.freeze(hydrated.map((h) => h.artifactId)),
        confidence: "measured" as const,
        notes: `plane=${planeResult.planeVersion} modes=${planeResult.modesExecuted.join(",")}`,
      }),
    ]),
  });
}
