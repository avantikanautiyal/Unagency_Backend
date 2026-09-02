/**
 * Step 9 — Strategy / knowledge / model catalogs (data-driven, not hard-coded in intelligence).
 */

import type { ExperimentStrategyDefinition } from "../contracts/experiment-strategy";

export const DEFAULT_EXPERIMENT_STRATEGIES: readonly ExperimentStrategyDefinition[] = Object.freeze([
  Object.freeze({
    strategyId: "strategy.baseline",
    version: "1.0.0",
    strategyName: "Baseline direct execution",
    description: "Default benchmark execution — no prompt augmentation beyond the canonical brief.",
    label: "Baseline",
    configuration: Object.freeze({ promptAugmentation: "none", reasoningDepth: "standard" }),
    applicability: Object.freeze({}),
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  Object.freeze({
    strategyId: "strategy.quality_first",
    version: "1.0.0",
    strategyName: "Quality-first structured output",
    description: "Emphasizes contract adherence and measurable quality dimensions in the request.",
    label: "Quality-first",
    configuration: Object.freeze({
      promptAugmentation: "quality_emphasis",
      reasoningDepth: "deep",
      emphasizeHardRequirements: true,
    }),
    applicability: Object.freeze({
      modalities: Object.freeze(["text", "document", "website", "presentation"] as const),
    }),
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  Object.freeze({
    strategyId: "strategy.latency_first",
    version: "1.0.0",
    strategyName: "Latency-first concise generation",
    description: "Favors concise structured outputs suitable for latency-sensitive benchmarks.",
    label: "Latency-first",
    configuration: Object.freeze({
      promptAugmentation: "concise",
      reasoningDepth: "standard",
      maxVerbosity: "low",
    }),
    applicability: Object.freeze({
      modalities: Object.freeze(["text"] as const),
      excludeOutputKinds: Object.freeze(["deferred_website", "presentation"] as const),
    }),
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
]);

const strategyIndex = new Map<string, ExperimentStrategyDefinition>(
  DEFAULT_EXPERIMENT_STRATEGIES.map((s) => [`${s.strategyId}@${s.version}`, s]),
);

export function getExperimentStrategy(
  strategyId: string,
  version = "1.0.0",
): ExperimentStrategyDefinition | undefined {
  return strategyIndex.get(`${strategyId}@${version}`);
}

export function listExperimentStrategies(): readonly ExperimentStrategyDefinition[] {
  return DEFAULT_EXPERIMENT_STRATEGIES;
}

export function registerExperimentStrategy(strategy: ExperimentStrategyDefinition): void {
  strategyIndex.set(`${strategy.strategyId}@${strategy.version}`, Object.freeze(strategy));
}
