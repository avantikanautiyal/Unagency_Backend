/**
 * Step 7 / 14B — Generalized Evaluation & Observation Plane orchestrator.
 * Single entry point for all UnAgency output modalities.
 */

import type { ValidationArtifactRef } from "../output-validation/artifact-context";
import type { ArtifactEvaluationEnrichment } from "../artifact-evaluation/types";
import { analyzeImageBytes } from "../artifact-evaluation/image-analyzer";
import {
  buildPerformanceMetricsFromRuntime,
  BROWSER_RUNTIME_EVALUATOR_ID,
  type BrowserRuntimeCheckResult,
} from "../runtime/browser-runtime-evaluator";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "./evaluation-plane-version";
import type {
  ApplicabilityRecord,
  EvaluationPlaneInput,
  EvaluationPlaneResult,
  EvaluationMode,
  EvaluationStageTrace,
  ObjectiveMetric,
} from "./types";
import { resolveModalityProfile, resolveDimensionApplicability } from "./modality-profiles";
import { selectAdapterForContext } from "./adapters/modality-adapters";
import { bridgeToArtifactEvaluationBundle } from "./step2-bridge";

function buildApplicability(profile: ReturnType<typeof resolveModalityProfile>): ApplicabilityRecord[] {
  const dims = [
    "quality.seo",
    "quality.accessibility",
    "quality.performance",
    "quality.visual_quality",
    "quality.visual_hierarchy",
    "quality.brand_adherence",
    "quality.ux",
  ];
  return dims.map((d) => {
    const resolved = resolveDimensionApplicability(profile, d);
    return Object.freeze({ dimensionId: d, status: resolved.status, reason: resolved.reason });
  });
}

function refsFromHydrated(
  hydrated: readonly import("../artifact-evaluation/types").HydratedArtifact[],
): ValidationArtifactRef[] {
  return hydrated.map((h) => {
    if (h.kind === "image") {
      const image = analyzeImageBytes(h.bytes, h.mimeType);
      return Object.freeze({
        artifactId: h.artifactId,
        kind: h.kind,
        mimeType: h.mimeType,
        byteSize: h.byteSize,
        width: image.width,
        height: image.height,
      });
    }
    return Object.freeze({
      artifactId: h.artifactId,
      kind: h.kind,
      mimeType: h.mimeType,
      byteSize: h.byteSize,
    });
  });
}

function deriveArtifactRenderTrace(input: {
  readonly profile: ReturnType<typeof resolveModalityProfile>;
  readonly hydratedCount: number;
}): Pick<EvaluationStageTrace, "artifactRender" | "artifactRenderReason"> {
  if (!input.profile.supportsRendered) {
    return Object.freeze({
      artifactRender: "SKIPPED",
      artifactRenderReason: "modality_does_not_support_rendered_evaluation",
    });
  }
  if (input.hydratedCount === 0) {
    return Object.freeze({
      artifactRender: "SKIPPED",
      artifactRenderReason: "no_artifacts_hydrated",
    });
  }
  return Object.freeze({ artifactRender: "COMPLETED" });
}

function deriveRuntimeTrace(input: {
  readonly profile: ReturnType<typeof resolveModalityProfile>;
  readonly htmlContent?: string;
  readonly runRuntimeCheckProvided: boolean;
  readonly runtimeResult?: BrowserRuntimeCheckResult;
}): Pick<EvaluationStageTrace, "runtimeEvaluation" | "runtimeEvaluationReason"> {
  if (!input.profile.supportsRuntime) {
    return Object.freeze({
      runtimeEvaluation: "SKIPPED",
      runtimeEvaluationReason: "runtime_not_applicable_to_modality",
    });
  }
  if (!input.htmlContent) {
    return Object.freeze({
      runtimeEvaluation: "SKIPPED",
      runtimeEvaluationReason: "no_html_content_for_runtime",
    });
  }
  if (!input.runRuntimeCheckProvided) {
    return Object.freeze({
      runtimeEvaluation: "SKIPPED",
      runtimeEvaluationReason: "runtime_check_not_configured",
    });
  }
  if (!input.runtimeResult) {
    return Object.freeze({
      runtimeEvaluation: "SKIPPED",
      runtimeEvaluationReason: "runtime_check_did_not_execute",
    });
  }
  if (!input.runtimeResult.evaluated) {
    return Object.freeze({
      runtimeEvaluation: "SKIPPED",
      runtimeEvaluationReason:
        input.runtimeResult.skipReason ?? "runtime_capability_or_dependency_unavailable",
    });
  }
  if (
    input.runtimeResult.status === "FAILED" ||
    input.runtimeResult.startupSucceeded === false ||
    input.runtimeResult.runtimeErrors.length > 0
  ) {
    return Object.freeze({ runtimeEvaluation: "FAILED" });
  }
  return Object.freeze({ runtimeEvaluation: "COMPLETED" });
}

export async function runEvaluationPlane(
  input: EvaluationPlaneInput,
): Promise<{
  readonly planeResult: EvaluationPlaneResult;
  readonly enrichment: ArtifactEvaluationEnrichment;
}> {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const profile = resolveModalityProfile(input.outputKind);
  const modesExecuted: EvaluationMode[] = ["static"];

  let hydrated: Awaited<ReturnType<NonNullable<EvaluationPlaneInput["hydrateArtifacts"]>>> = [];
  if ((input.mediaArtifactIds?.length ?? 0) > 0 && input.hydrateArtifacts) {
    hydrated = await input.hydrateArtifacts(input.mediaArtifactIds!);
    if (hydrated.length > 0) modesExecuted.push("rendered");
  }

  const adapterResult = await selectAdapterForContext(input, hydrated);
  const metrics: ObjectiveMetric[] = [...adapterResult.metrics];
  const htmlArtifactId = hydrated.find((h) => h.kind === "html" || h.textContent)?.artifactId;

  if (input.runIndependentJudgement && profile.supportsIndependentJudgement) {
    const renderRef =
      adapterResult.htmlContent ??
      input.preview ??
      hydrated[0]?.artifactId ??
      "text";
    const judgement = await input.runIndependentJudgement({
      renderReference: renderRef,
      dimensionId: "quality.visual_quality",
      briefObjective: input.briefObjective,
    });
    if (judgement) {
      modesExecuted.push("independent_judgement");
      metrics.push(
        Object.freeze({
          metricId: "independent.visual_quality",
          dimension: judgement.dimensionId,
          value: judgement.score,
          unit: "score",
          threshold: 50,
          status: judgement.score >= 50 ? "PASS" : "UNVERIFIED",
          measurementMethod: "independent_visual_judge",
          evaluatorId: EVALUATION_PLANE_ID,
          evaluatorVersion: EVALUATION_PLANE_VERSION,
          measurementStatus: "MODEL_JUDGED",
          evidence: judgement.evidence,
          confidence: "MODEL_JUDGED",
        }),
      );
    }
  }

  let runtimeResult: BrowserRuntimeCheckResult | undefined;
  let runtimeErrors: readonly string[] | undefined;

  if (profile.supportsRuntime && adapterResult.htmlContent) {
    if (input.runRuntimeCheck) {
      runtimeResult = await input.runRuntimeCheck(adapterResult.htmlContent);
      if (runtimeResult.evaluated) {
        modesExecuted.push("runtime");
        runtimeErrors = runtimeResult.runtimeErrors;
        metrics.push(
          Object.freeze({
            metricId: "runtime.errors",
            dimension: "hard.website.no_critical_runtime",
            value: runtimeResult.runtimeErrors.length,
            unit: "count",
            threshold: 0,
            status: runtimeResult.runtimeErrors.length === 0 ? "PASS" : "FAIL",
            measurementMethod: "runtime_observation",
            evaluatorId: EVALUATION_PLANE_ID,
            evaluatorVersion: EVALUATION_PLANE_VERSION,
            measurementStatus: "MEASURED",
            evidence: runtimeResult.evidence,
            confidence: "MEASURED",
            artifactId: htmlArtifactId,
          }),
        );
        if (runtimeResult.performanceReadings?.length) {
          metrics.push(
            ...buildPerformanceMetricsFromRuntime({
              readings: runtimeResult.performanceReadings,
              artifactId: htmlArtifactId,
            }),
          );
        }
        if (runtimeResult.browserAccessibility) {
          const a11y = runtimeResult.browserAccessibility;
          metrics.push(
            Object.freeze({
              metricId: "html.accessibility_browser_score",
              dimension: "quality.accessibility",
              value: a11y.score,
              unit: "score",
              threshold: 60,
              status: a11y.criticalCount > 0 ? "FAIL" : a11y.score >= 60 ? "PASS" : "UNVERIFIED",
              measurementMethod: "browser_dom_accessibility",
              evaluatorId: EVALUATION_PLANE_ID,
              evaluatorVersion: EVALUATION_PLANE_VERSION,
              measurementStatus: "MEASURED",
              evidence: a11y.evidence,
              confidence: "MEASURED",
              artifactId: htmlArtifactId,
            }),
          );
        }
        if (runtimeResult.visualMetrics?.length) {
          metrics.push(...runtimeResult.visualMetrics);
        }
        if (runtimeResult.failureCategory) {
          metrics.push(
            Object.freeze({
              metricId: "runtime.failure_category",
              dimension: "hard.website.no_critical_runtime",
              value: runtimeResult.failureCategory,
              status: "UNVERIFIED",
              measurementMethod: "runtime_observation",
              evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
              evaluatorVersion: EVALUATION_PLANE_VERSION,
              measurementStatus: "MEASURED",
              evidence: Object.freeze([`failureCategory=${runtimeResult.failureCategory}`]),
              confidence: "MEASURED",
              artifactId: htmlArtifactId,
            }),
          );
        }
      }
    }
  }

  const renderTrace = deriveArtifactRenderTrace({
    profile,
    hydratedCount: hydrated.length,
  });
  const runtimeTrace = deriveRuntimeTrace({
    profile,
    htmlContent: adapterResult.htmlContent,
    runRuntimeCheckProvided: Boolean(input.runRuntimeCheck),
    runtimeResult,
  });
  const stageTrace: EvaluationStageTrace = Object.freeze({
    ...renderTrace,
    ...runtimeTrace,
  });

  const planeResult: EvaluationPlaneResult = Object.freeze({
    planeId: EVALUATION_PLANE_ID,
    planeVersion: EVALUATION_PLANE_VERSION,
    modality: profile,
    applicability: Object.freeze(buildApplicability(profile)),
    metrics: Object.freeze(metrics),
    modesExecuted: Object.freeze(modesExecuted),
    hydratedArtifactCount: hydrated.length,
    stageTrace,
  });

  const frozenAdapterResult = Object.freeze({
    ...adapterResult,
    metrics: planeResult.metrics,
  });

  const artifactEvaluation = bridgeToArtifactEvaluationBundle({
    ctx: input,
    planeResult,
    adapterResult: frozenAdapterResult,
    hydrated,
    nowIso,
    runtimeResult,
  });

  let artifactRefs = refsFromHydrated(hydrated);
  if (artifactRefs.length === 0 && (input.mediaArtifactIds?.length ?? 0) > 0) {
    artifactRefs = input.mediaArtifactIds!.map((id) =>
      Object.freeze({ artifactId: id, kind: "media" }),
    );
  }

  const imageMetric = hydrated.find((h) => h.kind === "image");
  const actualAspectRatio =
    imageMetric != null
      ? analyzeImageBytes(imageMetric.bytes, imageMetric.mimeType).aspectRatio
      : undefined;

  const enrichment: ArtifactEvaluationEnrichment = Object.freeze({
    artifactRefs: Object.freeze(artifactRefs),
    buildSucceeded: input.buildSucceeded,
    buildOutput: input.buildOutput,
    runtimeErrors,
    preview: adapterResult.htmlContent ?? adapterResult.textContent ?? input.preview,
    actualAspectRatio,
    artifactEvaluation,
    evaluationPlaneResult: planeResult,
  });

  return Object.freeze({ planeResult, enrichment });
}
