/**
 * Step 15 — Tier 1 controlled evidence matrix (2 models × 2 services × repeats).
 * Cost-bounded; does not activate adaptive routing.
 */

import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import {
  DEFAULT_BENCHMARK_BUDGET,
  type BenchmarkBudgetConfig,
} from "../contracts/benchmark-execution-config";
import type { EvidenceCollectionBudget } from "../evidence/evidence-collection-config";
import { STAGE1_REAL_VALIDATION_MODELS } from "./stage1-real-validation-config";

/** Representative high-value benchmarks — existing catalog IDs only. */
export const TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS = Object.freeze([
  "bench.website.landing-page",
  "bench.presentations.pitch-decks",
] as const);

export const TIER1_CONTROLLED_EVIDENCE_SERVICES = Object.freeze([
  "website",
  "presentations",
] as const);

export const TIER1_CONTROLLED_EVIDENCE_MODELS: readonly BenchmarkModelTarget[] =
  STAGE1_REAL_VALIDATION_MODELS;

export const TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT = 3;
export const TIER1_CONTROLLED_EVIDENCE_MAX_CONCURRENCY = 2;
export const TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION = "step15.tier1.default";

export const TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS =
  TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS.length *
  TIER1_CONTROLLED_EVIDENCE_MODELS.length *
  TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT;

export const TIER1_CONTROLLED_EVIDENCE_BUDGET: BenchmarkBudgetConfig = Object.freeze({
  maxInvocations: TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  maxEstimatedCostUsd: null,
  largeRunThreshold: TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  allowLargeRunOverride: false,
});

export const TIER1_EVIDENCE_COLLECTION_BUDGET: EvidenceCollectionBudget = Object.freeze({
  maxInvocations: TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  maxEstimatedCostUsd: null,
  maxConcurrentExecutions: TIER1_CONTROLLED_EVIDENCE_MAX_CONCURRENCY,
  maxRepeats: TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  largeRunThreshold: TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  allowLargeRunOverride: false,
  requireDryRunConfirmation: true,
});

/** Tier 2 — expand with industry variants only when Tier 1 analysis justifies it. */
export const TIER2_CONTROLLED_EVIDENCE_BENCHMARK_IDS = Object.freeze([
  "bench.website.landing-page",
  "bench.website.landing-page.fashion",
  "bench.website.landing-page.healthcare",
  "bench.presentations.pitch-decks",
  "bench.presentations.pitch-decks.technology",
] as const);

export const TIER2_CONTROLLED_EVIDENCE_REPEAT_COUNT = 2;
export const TIER2_CONTROLLED_EVIDENCE_MAX_API_CALLS =
  TIER2_CONTROLLED_EVIDENCE_BENCHMARK_IDS.length *
  TIER1_CONTROLLED_EVIDENCE_MODELS.length *
  TIER2_CONTROLLED_EVIDENCE_REPEAT_COUNT;

export const TIER2_EVIDENCE_COLLECTION_BUDGET: EvidenceCollectionBudget = Object.freeze({
  maxInvocations: TIER2_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  maxEstimatedCostUsd: null,
  maxConcurrentExecutions: 2,
  maxRepeats: TIER2_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  largeRunThreshold: 30,
  allowLargeRunOverride: false,
  requireDryRunConfirmation: true,
});

export function tier1ControlledEvidenceCellCount(): number {
  return TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS;
}

export function tierControlledEvidenceCellCount(tier: 1 | 2 | 3): number {
  if (tier === 1) return TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS;
  if (tier === 2) return TIER2_CONTROLLED_EVIDENCE_MAX_API_CALLS;
  return DEFAULT_BENCHMARK_BUDGET.maxInvocations;
}
