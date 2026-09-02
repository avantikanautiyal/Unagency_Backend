/**
 * Shadow routing preparation — interfaces only; NOT activated in Step 3.
 * Future: compare actual router decision vs performance intelligence recommendation.
 */

export type RouterDecision = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly routingDecisionId?: string;
  readonly staticScore: number;
  readonly strategyId: string;
};

export type PerformanceRecommendation = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly recommendedScore: number;
  readonly confidence: "high" | "medium" | "low" | "insufficient";
  readonly sampleCount: number;
  readonly reason: string;
  readonly evidenceOnly: true;
};

export type ShadowRoutingComparison = {
  readonly actual: RouterDecision;
  readonly recommendation?: PerformanceRecommendation;
  readonly aligned: boolean;
  readonly note: string;
};

/**
 * Compare router decision against evidence-based recommendation.
 * Step 3: recommendation is evidence-only; never overrides production routing.
 */
export function compareShadowRouting(input: {
  readonly actual: RouterDecision;
  readonly recommendation?: PerformanceRecommendation;
}): ShadowRoutingComparison {
  const aligned =
    !input.recommendation ||
    (input.actual.providerId === input.recommendation.providerId &&
      input.actual.modelId === input.recommendation.modelId);

  return Object.freeze({
    actual: input.actual,
    recommendation: input.recommendation,
    aligned,
    note: aligned
      ? "Router decision aligns with performance evidence"
      : "Router decision differs from performance evidence (informational only — routing unchanged)",
  });
}
