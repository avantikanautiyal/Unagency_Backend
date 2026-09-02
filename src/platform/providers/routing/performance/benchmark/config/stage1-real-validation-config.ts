/**
 * Stage 1 — Real-model pre-pilot validation (2 models × 2 services = max 4 API calls).
 */

import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import { DEFAULT_BENCHMARK_BUDGET, type BenchmarkBudgetConfig } from "../contracts/benchmark-execution-config";

export const STAGE1_REAL_VALIDATION_BENCHMARK_IDS = Object.freeze([
  "bench.website.landing-page",
  "bench.presentations.pitch-decks",
] as const);

export const STAGE1_REAL_VALIDATION_MODELS: readonly BenchmarkModelTarget[] = Object.freeze([
  Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    capabilityId: "text.generate",
  }),
  Object.freeze({
    providerId: "provider.anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    capabilityId: "text.generate",
  }),
]);

export const STAGE1_REAL_VALIDATION_MAX_API_CALLS = 4;
export const STAGE1_REAL_VALIDATION_REPEAT_COUNT = 1;
export const STAGE1_REAL_VALIDATION_KNOWLEDGE_VERSION = "stage1.default";

export const STAGE1_REAL_VALIDATION_BUDGET: BenchmarkBudgetConfig = Object.freeze({
  maxInvocations: STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  maxEstimatedCostUsd: null,
  largeRunThreshold: STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  allowLargeRunOverride: false,
});

export function stage1RealValidationCellCount(): number {
  return (
    STAGE1_REAL_VALIDATION_BENCHMARK_IDS.length * STAGE1_REAL_VALIDATION_MODELS.length
  );
}
