/**
 * Priority 4.4 — Eligible comparison candidate selection (registry-driven, no fabrication).
 */

import type { BenchmarkModelTarget } from "../../contracts/benchmark-case";
import { TIER1_CONTROLLED_EVIDENCE_MODELS } from "../../config/tier1-controlled-evidence-config";
import type { EvidenceReadinessSliceReport } from "../readiness/evidence-readiness-contract";

export function modelIdentity(m: BenchmarkModelTarget): string {
  return `${m.providerId}:${m.modelId}`;
}

export function resolveEligibleComparisonModels(input?: {
  readonly eligibleModels?: readonly BenchmarkModelTarget[];
}): readonly BenchmarkModelTarget[] {
  return input?.eligibleModels ?? TIER1_CONTROLLED_EVIDENCE_MODELS;
}

export function selectComparisonCandidate(input: {
  readonly slice: EvidenceReadinessSliceReport;
  readonly eligibleModels?: readonly BenchmarkModelTarget[];
}): { readonly candidate?: BenchmarkModelTarget; readonly status: "FOUND" | "NO_ELIGIBLE_CANDIDATE" } {
  const registry = resolveEligibleComparisonModels(input);
  const present = new Set(input.slice.candidates.map((c) => `${c.providerId}:${c.modelId}`));

  const missing = registry.filter((m) => !present.has(modelIdentity(m)));
  if (missing.length === 0) {
    return Object.freeze({ status: "NO_ELIGIBLE_CANDIDATE" });
  }

  return Object.freeze({ candidate: missing[0], status: "FOUND" });
}

export function selectModelsForPilot(input: {
  readonly slice: EvidenceReadinessSliceReport;
  readonly eligibleModels?: readonly BenchmarkModelTarget[];
}): readonly BenchmarkModelTarget[] {
  const registry = resolveEligibleComparisonModels(input);
  if (input.slice.controlledEvidenceCount === 0) {
    return Object.freeze(registry.slice(0, Math.min(2, registry.length)));
  }
  const present = new Set(input.slice.candidates.map((c) => `${c.providerId}:${c.modelId}`));
  const needed = registry.filter((m) => !present.has(modelIdentity(m)));
  return Object.freeze(needed.length > 0 ? needed.slice(0, 1) : registry.slice(0, 1));
}
