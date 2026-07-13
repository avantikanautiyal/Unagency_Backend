/**
 * Shared learner helpers.
 */

import type { OptimizationDomain } from "../contracts/enums";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";

export function makeRecommendation(
  id: string,
  domain: OptimizationDomain,
  title: string,
  description: string,
  rationale: string,
  expectedImpact: number,
  confidence: number,
  createdAt: string,
  priority: OptimizationRecommendation["priority"] = "medium"
): OptimizationRecommendation {
  return {
    id,
    domain,
    priority,
    disposition: "advisory",
    title,
    description,
    rationale,
    expectedImpact,
    confidence,
    advisoryOnly: true,
    evidenceIds: [],
    createdAt,
  };
}

export function avgMetric(
  values: readonly number[],
  fallback = 0
): number {
  if (values.length === 0) return fallback;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function patternFor(
  id: string,
  domain: OptimizationDomain,
  description: string,
  frequency: number,
  impact: number,
  detectedAt: string
): ExecutionPattern {
  return { id, domain, description, frequency, impact, detectedAt };
}

export function inputSampleSize(request: ExecutionOptimizationRequest): number {
  const i = request.inputs;
  return (
    (i.executionArtifacts?.length ?? 0) +
    (i.evaluationReports?.length ?? 0) +
    (i.learningResults?.length ?? 0) +
    (i.observabilityReports?.length ?? 0) +
    (i.intelligenceResults?.length ?? 0)
  );
}
