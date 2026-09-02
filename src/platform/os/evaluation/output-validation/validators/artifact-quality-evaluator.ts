/**
 * Step 6 — Quality dimension evaluators for artifact-backed evidence.
 */

import type { QualityDimension } from "../../../contracts/output-contracts/evaluation-methods";
import type { QualityDimensionValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import { ARTIFACT_EVALUATION_VERSION } from "../../artifact-evaluation/artifact-evaluation-version";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";

const EVALUATOR_VERSION = `artifact-quality.${ARTIFACT_EVALUATION_VERSION}.${OUTPUT_VALIDATION_VERSION}`;

function dimensionResult(
  dim: QualityDimension,
  status: QualityDimensionValidationResult["status"],
  score: number,
  evidence: readonly string[],
  confidence?: string,
): QualityDimensionValidationResult {
  const weight = dim.weight ?? 1;
  const weightedContribution =
    status === "PASS" || status === "FAIL" ? (score / 100) * weight * 100 : 0;
  return Object.freeze({
    dimensionId: dim.id,
    label: dim.label,
    score,
    threshold: dim.threshold,
    weight,
    weightedContribution,
    status,
    evidence: Object.freeze([
      ...evidence,
      ...(confidence ? [`confidence=${confidence}`] : []),
    ]),
    evaluatorVersion: EVALUATOR_VERSION,
    evaluationMethod: dim.evaluationMethod,
  });
}

function findVisualDimension(
  ctx: ValidationArtifactContext,
  dimensionId: string,
): { score: number; evidence: readonly string[]; confidence: string } | undefined {
  const dims = ctx.artifactEvaluation?.visual?.dimensions ?? [];
  const match = dims.find((d) => d.dimensionId === dimensionId);
  if (!match) return undefined;
  return {
    score: match.score,
    evidence: match.evidence,
    confidence: match.confidence,
  };
}

export function evaluateAccessibilityQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const a11y = ctx.artifactEvaluation?.accessibility;
  if (!a11y?.evaluated) {
    return dimensionResult(dim, "NOT_AUTOMATED", 0, [
      "accessibility evaluation requires artifact HTML scan",
    ]);
  }
  const status =
    a11y.criticalCount > 0 ? "FAIL" : a11y.score >= dim.threshold ? "PASS" : "UNVERIFIED";
  return dimensionResult(dim, status, a11y.score, a11y.evidence, a11y.confidence);
}

export function evaluatePerformanceQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const perf = ctx.artifactEvaluation?.performance;
  if (!perf?.evaluated) {
    return dimensionResult(dim, "NOT_AUTOMATED", 0, [
      "performance evaluation requires browser runtime measurements",
    ]);
  }
  const status = perf.score >= dim.threshold ? "PASS" : "FAIL";
  return dimensionResult(dim, status, perf.score, perf.evidence, perf.confidence);
}

export function evaluateSeoQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const seo = ctx.artifactEvaluation?.seo;
  if (!seo?.evaluated) {
    return dimensionResult(dim, "NOT_AUTOMATED", 0, ["SEO evaluation requires HTML artifact"]);
  }
  const status = seo.score >= dim.threshold ? "PASS" : "FAIL";
  return dimensionResult(dim, status, seo.score, seo.evidence, seo.confidence);
}

export function evaluateBrandAdherenceQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const brand = ctx.artifactEvaluation?.brandAdherence;
  if (!brand?.evaluated) {
    return dimensionResult(dim, "NOT_AUTOMATED", 0, [
      "brand adherence requires brand context + inspectable artifact",
    ]);
  }
  const status = brand.score >= dim.threshold ? "PASS" : "UNVERIFIED";
  return dimensionResult(dim, status, brand.score, brand.evidence, brand.confidence);
}

export function evaluateVisualHierarchyQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const visual = findVisualDimension(ctx, dim.id);
  if (!visual) {
    return dimensionResult(dim, "NOT_AUTOMATED", 0, [
      "visual hierarchy requires rendered artifact evaluation",
    ]);
  }
  const status = visual.score >= dim.threshold ? "PASS" : "UNVERIFIED";
  return dimensionResult(dim, status, visual.score, visual.evidence, visual.confidence);
}

export function evaluateArtifactBackedVisualQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult | undefined {
  if (dim.id.includes("accessibility")) {
    return evaluateAccessibilityQualityDimension(dim, ctx);
  }
  if (dim.id.includes("performance")) {
    return evaluatePerformanceQualityDimension(dim, ctx);
  }
  if (dim.id.includes("seo")) {
    return evaluateSeoQualityDimension(dim, ctx);
  }
  if (dim.id.includes("brand")) {
    return evaluateBrandAdherenceQualityDimension(dim, ctx);
  }
  if (dim.id.includes("hierarchy")) {
    return evaluateVisualHierarchyQualityDimension(dim, ctx);
  }
  const visual = findVisualDimension(ctx, dim.id);
  if (visual) {
    const status = visual.score >= dim.threshold ? "PASS" : "UNVERIFIED";
    return dimensionResult(dim, status, visual.score, visual.evidence, visual.confidence);
  }
  return undefined;
}
