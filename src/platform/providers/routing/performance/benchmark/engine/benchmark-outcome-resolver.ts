/**
 * Step 4B — Resolve final benchmark outcome from execution + validation evidence.
 */

import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { BenchmarkOutcome } from "../contracts/benchmark-outcome";
import type { PerformanceFailureCategory } from "../../contracts/performance-evidence";
import type { BenchmarkCompatibilityVerdict } from "./benchmark-compatibility";
import type { BenchmarkValiditySpec } from "./benchmark-validity-model";

export type BenchmarkOutcomeInput = {
  readonly compatibility: BenchmarkCompatibilityVerdict;
  readonly operationalFailure?: {
    readonly category: PerformanceFailureCategory;
    readonly message: string;
  };
  readonly validation?: OutputValidationResult;
  readonly validationUnavailableReason?: string;
  readonly skippedPreFlight?: boolean;
};

const CONTRACT_MISMATCH_CATEGORIES = new Set([
  "invalid_output_format",
  "missing_requirement",
  "functional_failure",
  "technical_failure",
]);

export function resolveBenchmarkOutcome(input: BenchmarkOutcomeInput): BenchmarkOutcome {
  if (input.skippedPreFlight) {
    return input.compatibility.outcomeIfSkipped;
  }

  if (input.operationalFailure) {
    if (input.operationalFailure.category === "unsupported_capability") {
      return "MODEL_CAPABILITY_UNSUPPORTED";
    }
    return "PROVIDER_OPERATIONAL_FAILURE";
  }

  if (input.validationUnavailableReason && !input.validation) {
    return "VALIDATION_UNAVAILABLE";
  }

  if (!input.validation) {
    return "VALIDATION_UNAVAILABLE";
  }

  const v = input.validation;
  if (v.completionAllowed && v.status === "PASS") {
    return "MODEL_SUCCESS";
  }

  const validity = input.compatibility.validity;
  const hasContractMismatch = v.failureSummary.failures.some((f) =>
    CONTRACT_MISMATCH_CATEGORIES.has(f.failureCategory),
  );
  const hasMandatoryContractFailure = v.requirements.some(
    (r) => r.status === "FAIL" && r.blocksCompletion,
  );

  // Website/presentation/document: prose/JSON without artifact pipeline → contract failure, not model incompetence
  if (
    !validity.validForPureModelComparison &&
    (hasContractMismatch || hasMandatoryContractFailure)
  ) {
    return "CONTRACT_FAILURE";
  }

  if (
    !input.compatibility.executionCapabilityAvailable &&
    (hasContractMismatch || hasMandatoryContractFailure)
  ) {
    return "CONTRACT_FAILURE";
  }

  if (v.status === "BLOCKED" || v.status === "FAIL" || !v.completionAllowed) {
    return "MODEL_QUALITY_FAILURE";
  }

  return "MODEL_SUCCESS";
}

export function interpretQualityScore(input: {
  readonly outcome: BenchmarkOutcome;
  readonly qualityScore: number;
  readonly completionAllowed: boolean;
  readonly validity: BenchmarkValiditySpec;
}): string | undefined {
  if (input.outcome === "EXECUTION_CAPABILITY_UNAVAILABLE") {
    return "Quality not applicable — benchmark executor lacks required execution interfaces.";
  }
  if (input.outcome === "MODEL_CAPABILITY_UNSUPPORTED") {
    return "Quality not applicable — model lacks required capability.";
  }
  if (input.outcome === "PROVIDER_OPERATIONAL_FAILURE") {
    return "Quality not applicable — provider operational failure.";
  }
  if (input.outcome === "VALIDATION_UNAVAILABLE") {
    return "Quality not applicable — Step 2 validation unavailable.";
  }
  if (input.outcome === "CONTRACT_FAILURE") {
    return (
      `Diagnostic content quality score (${input.qualityScore}) — completion blocked by artifact ` +
      `contract mismatch. Not evidence of model service incompetence; execution interface insufficient ` +
      `for ${input.validity.contractOutputKind}.`
    );
  }
  if (!input.completionAllowed && input.qualityScore > 0) {
    return (
      `Diagnostic content quality score (${input.qualityScore}) — completion blocked by hard ` +
      "requirements. Quality does not override contract failure."
    );
  }
  return undefined;
}

export function outcomeAffectsQualityScore(outcome: BenchmarkOutcome): boolean {
  return (
    outcome === "MODEL_SUCCESS" ||
    outcome === "MODEL_QUALITY_FAILURE" ||
    outcome === "CONTRACT_FAILURE"
  );
}
