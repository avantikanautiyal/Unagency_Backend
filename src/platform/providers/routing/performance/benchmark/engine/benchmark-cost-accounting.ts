/**
 * Step 4B — Benchmark cost accounting (reuses IPricingEngine / model registry).
 */

import type { CanonicalModel } from "../../../../model-registry/contracts/model";
import type { IPricingEngine, IModelRegistry } from "../../../../model-registry/interfaces/model-registry";

export type BenchmarkCostBreakdown = {
  readonly pricingModelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly perRequestCostUsd: number;
  readonly totalCostUsd: number;
  readonly pricingSource: "model_registry";
  readonly inputPer1kTokens: number;
  readonly outputPer1kTokens: number;
};

export function explainBenchmarkCost(input: {
  readonly model: CanonicalModel;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): BenchmarkCostBreakdown {
  const inputPer1k = input.model.pricing.inputPer1kTokens ?? 0;
  const outputPer1k = input.model.pricing.outputPer1kTokens ?? 0;
  const perRequest = input.model.pricing.perRequest ?? 0;
  const inputCostUsd = (inputPer1k * input.inputTokens) / 1000;
  const outputCostUsd = (outputPer1k * input.outputTokens) / 1000;

  return Object.freeze({
    pricingModelId: String(input.model.modelId),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCostUsd,
    outputCostUsd,
    perRequestCostUsd: perRequest,
    totalCostUsd: inputCostUsd + outputCostUsd + perRequest,
    pricingSource: "model_registry",
    inputPer1kTokens: inputPer1k,
    outputPer1kTokens: outputPer1k,
  });
}

export function estimateBenchmarkCostFromRegistry(
  deps: { readonly modelRegistry?: IModelRegistry; readonly pricingEngine?: IPricingEngine },
  modelId: string,
  inputTokens?: number,
  outputTokens?: number,
): { readonly estimatedCost?: number; readonly breakdown?: BenchmarkCostBreakdown } {
  if (!deps.modelRegistry || !deps.pricingEngine) return {};
  if (inputTokens == null && outputTokens == null) return {};

  const modelResult = deps.modelRegistry.getModel(modelId);
  if (!modelResult.ok) return {};

  const inTok = inputTokens ?? 0;
  const outTok = outputTokens ?? 0;
  const breakdown = explainBenchmarkCost({
    model: modelResult.value,
    inputTokens: inTok,
    outputTokens: outTok,
  });

  const costResult = deps.pricingEngine.estimateCost(modelResult.value, inTok, outTok);
  return Object.freeze({
    estimatedCost: costResult.ok ? costResult.value : breakdown.totalCostUsd,
    breakdown,
  });
}

/**
 * Documents why pilot costs can appear high (~$30+/run):
 * long benchmark briefs + verbose prose outputs × output token pricing.
 */
export function describeCostDrivers(breakdown: BenchmarkCostBreakdown): string {
  const outputShare =
    breakdown.totalCostUsd > 0
      ? ((breakdown.outputCostUsd / breakdown.totalCostUsd) * 100).toFixed(0)
      : "0";
  return (
    `Cost from registry pricing on ${breakdown.pricingModelId}: ` +
    `${breakdown.inputTokens} input + ${breakdown.outputTokens} output tokens ` +
    `(input $${breakdown.inputPer1kTokens}/1k, output $${breakdown.outputPer1kTokens}/1k). ` +
    `Output tokens drive ~${outputShare}% of estimated cost.`
  );
}
