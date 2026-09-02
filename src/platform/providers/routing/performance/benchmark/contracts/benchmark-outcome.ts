/**
 * Step 4B — Benchmark outcome taxonomy.
 * Distinguishes model quality from execution/capability/operational failures.
 */

/** Canonical benchmark evidence outcome — do not collapse into generic quality failure. */
export type BenchmarkOutcome =
  | "MODEL_SUCCESS"
  | "MODEL_QUALITY_FAILURE"
  | "CONTRACT_FAILURE"
  | "EXECUTION_CAPABILITY_UNAVAILABLE"
  | "MODEL_CAPABILITY_UNSUPPORTED"
  | "PROVIDER_OPERATIONAL_FAILURE"
  | "VALIDATION_UNAVAILABLE";

export const BENCHMARK_OUTCOME_LABELS: Readonly<Record<BenchmarkOutcome, string>> =
  Object.freeze({
    MODEL_SUCCESS: "Model satisfied the benchmark contract under available execution conditions",
    MODEL_QUALITY_FAILURE:
      "Model produced evaluable output but failed quality or non-critical requirements",
    CONTRACT_FAILURE:
      "Output could not satisfy the required artifact contract (often an execution-interface mismatch)",
    EXECUTION_CAPABILITY_UNAVAILABLE:
      "Benchmark executor lacks the interface required to produce the contract artifact",
    MODEL_CAPABILITY_UNSUPPORTED:
      "Model/provider does not support the required model capability for this benchmark",
    PROVIDER_OPERATIONAL_FAILURE:
      "Provider dispatch failed (timeout, auth, rate limit, infra, etc.)",
    VALIDATION_UNAVAILABLE:
      "Step 2 validation could not run (missing contract composition or service mapping)",
  });

export function isModelQualityEvidence(outcome: BenchmarkOutcome): boolean {
  return (
    outcome === "MODEL_SUCCESS" ||
    outcome === "MODEL_QUALITY_FAILURE" ||
    outcome === "CONTRACT_FAILURE"
  );
}

export function isFairModelComparisonOutcome(outcome: BenchmarkOutcome): boolean {
  return outcome === "MODEL_SUCCESS" || outcome === "MODEL_QUALITY_FAILURE";
}
