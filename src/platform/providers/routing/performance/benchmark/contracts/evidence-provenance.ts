/**
 * Step 10 — Evidence provenance distinguishing production vs controlled benchmark evidence.
 */

export type EvidenceSource = "production" | "benchmark";

export type EvidenceMode = "observational" | "controlled";

export const PRODUCTION_BENCHMARK_ID = "production.execution" as const;
export const PRODUCTION_BENCHMARK_VERSION = "1.0.0" as const;

export const BENCHMARK_EVIDENCE_DEFAULTS = Object.freeze({
  evidenceSource: "benchmark" as const,
  evidenceMode: "controlled" as const,
});

export const PRODUCTION_EVIDENCE_DEFAULTS = Object.freeze({
  evidenceSource: "production" as const,
  evidenceMode: "observational" as const,
  benchmarkId: PRODUCTION_BENCHMARK_ID,
  benchmarkVersion: PRODUCTION_BENCHMARK_VERSION,
});
