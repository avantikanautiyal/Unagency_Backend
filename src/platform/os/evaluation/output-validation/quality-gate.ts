/**
 * Quality Gate — deterministic completion decision.
 * High quality score MUST NOT override failed mandatory requirements.
 */

import type {
  HardRequirementSummary,
  OutputValidationResult,
  QualityDimensionValidationResult,
  QualitySummary,
  RequirementValidationResult,
  ValidationGateStatus,
} from "./validation-result";

export type QualityGatePolicy = {
  /** Block completion when any blocking hard requirement is UNVERIFIED. */
  readonly blockOnUnverifiedMandatory: boolean;
  /** Allow completion when quality is below threshold but hard reqs pass. */
  readonly allowNeedsRevision: boolean;
  /** Minimum overall quality score for PASS (0-100). */
  readonly minQualityScore: number;
  /**
   * When true: deliverable materialization already established the product
   * (e.g. website ZIP/HTML). Observational UNVERIFIED / NOT_AUTOMATED /
   * quality-below must not erase completion. Hard FAIL still blocks.
   */
  readonly materializationCompletionAuthority?: boolean;
};

export const DEFAULT_QUALITY_GATE_POLICY: QualityGatePolicy = Object.freeze({
  blockOnUnverifiedMandatory: true,
  allowNeedsRevision: true,
  minQualityScore: 70,
});

/** Policy when ZIP/HTML (or equivalent) materialization already succeeded. */
export const MATERIALIZED_DELIVERABLE_QUALITY_GATE_POLICY: QualityGatePolicy =
  Object.freeze({
    blockOnUnverifiedMandatory: false,
    allowNeedsRevision: true,
    minQualityScore: 70,
    materializationCompletionAuthority: true,
  });

export function summarizeHardRequirements(
  requirements: readonly RequirementValidationResult[],
): HardRequirementSummary {
  const hard = requirements.filter((r) => !r.requirementId.startsWith("quality."));
  const passed = hard.filter((r) => r.status === "PASS").length;
  const failed = hard.filter((r) => r.status === "FAIL").length;
  const unverified = hard.filter((r) => r.status === "UNVERIFIED").length;
  const notAutomated = hard.filter((r) => r.status === "NOT_AUTOMATED").length;
  const criticalFailed = hard.filter(
    (r) =>
      r.status === "FAIL" &&
      (r.severity === "critical" || r.blocksCompletion),
  ).length;
  const blockingUnverified = hard.filter(
    (r) =>
      r.blocksCompletion &&
      (r.status === "UNVERIFIED" || r.status === "NOT_AUTOMATED"),
  ).length;

  return Object.freeze({
    total: hard.length,
    passed,
    failed,
    unverified,
    notAutomated,
    criticalFailed,
    blocksCompletion:
      criticalFailed > 0 || failed > 0 || blockingUnverified > 0,
  });
}

export function summarizeQualityDimensions(
  dimensions: readonly QualityDimensionValidationResult[],
): QualitySummary {
  const evaluated = dimensions.filter(
    (d) => d.status === "PASS" || d.status === "FAIL",
  ).length;
  const unverified = dimensions.filter(
    (d) => d.status === "UNVERIFIED" || d.status === "NOT_AUTOMATED",
  ).length;

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const weightedSum = dimensions.reduce((s, d) => s + d.weightedContribution, 0);
  const overallScore = Math.round(weightedSum / totalWeight);
  const measured = dimensions.filter(
    (d) => d.status === "PASS" || d.status === "FAIL",
  );
  const measuredWeight = measured.reduce((s, d) => s + d.weight, 0);
  const measuredScore =
    measured.length > 0 && measuredWeight > 0
      ? Math.round(
          measured.reduce((s, d) => s + d.weightedContribution, 0) /
            measuredWeight,
        )
      : null;

  const belowThresholdIds = dimensions
    .filter((d) => d.status === "FAIL" || (d.status === "PASS" && d.score < d.threshold))
    .map((d) => d.dimensionId);

  const thresholdMet =
    dimensions.length === 0 ||
    dimensions.every(
      (d) =>
        d.status === "UNVERIFIED" ||
        d.status === "NOT_AUTOMATED" ||
        d.score >= d.threshold,
    );

  return Object.freeze({
    totalDimensions: dimensions.length,
    evaluated,
    unverified,
    overallScore,
    measuredScore,
    thresholdMet,
    belowThresholdIds: Object.freeze(belowThresholdIds),
  });
}

export function applyQualityGate(input: {
  readonly hardSummary: HardRequirementSummary;
  readonly qualitySummary: QualitySummary;
  readonly requirements: readonly RequirementValidationResult[];
  readonly policy?: QualityGatePolicy;
}): {
  readonly status: ValidationGateStatus;
  readonly completionAllowed: boolean;
  readonly reason: string;
} {
  const policy = input.policy ?? DEFAULT_QUALITY_GATE_POLICY;
  const { hardSummary, qualitySummary, requirements } = input;

  const blockingFailures = requirements.filter(
    (r) =>
      r.blocksCompletion &&
      r.status === "FAIL" &&
      (r.severity === "critical" || r.severity === "high"),
  );
  if (blockingFailures.length > 0 || hardSummary.criticalFailed > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      completionAllowed: false,
      reason: `Critical mandatory requirement(s) failed: ${blockingFailures.map((r) => r.requirementId).join(", ") || hardSummary.criticalFailed + " critical"}`,
    });
  }

  const mandatoryFails = requirements.filter(
    (r) => r.status === "FAIL" && r.blocksCompletion,
  );
  if (mandatoryFails.length > 0 || hardSummary.failed > 0) {
    return Object.freeze({
      status: "FAIL" as const,
      completionAllowed: false,
      reason: `Mandatory requirement(s) failed: ${mandatoryFails.map((r) => r.requirementId).join(", ")}`,
    });
  }

  if (policy.blockOnUnverifiedMandatory) {
    const blockingUnverified = requirements.filter(
      (r) =>
        r.blocksCompletion &&
        !r.optional &&
        r.status === "UNVERIFIED",
    );
    const blockingNotAutomated = requirements.filter(
      (r) =>
        r.blocksCompletion &&
        !r.optional &&
        r.status === "NOT_AUTOMATED" &&
        (r.severity === "critical" || r.evaluationMethod === "build_test_execution"),
    );
    if (blockingUnverified.length > 0 || blockingNotAutomated.length > 0) {
      const ids = [...blockingUnverified, ...blockingNotAutomated].map((r) => r.requirementId);
      // Policy still withholds completion, but nothing was measured as failing:
      // report UNVERIFIED, never a quality FAIL.
      return Object.freeze({
        status: "UNVERIFIED" as const,
        completionAllowed: false,
        reason: `Mandatory requirement(s) unverified/not automated: ${ids.join(", ")}`,
      });
    }
  }

  // Quality verdicts come from measured dimensions only. Unmeasured
  // (UNVERIFIED / NOT_AUTOMATED) dimensions are a verification gap, not a
  // low score.
  const qualityBelow =
    !qualitySummary.thresholdMet ||
    (qualitySummary.measuredScore != null &&
      qualitySummary.measuredScore < policy.minQualityScore);
  const qualityUnverified =
    !qualityBelow &&
    qualitySummary.unverified > 0 &&
    qualitySummary.overallScore < policy.minQualityScore;

  // Materialization authority: quality plane is observational — do not RETRY
  // a successfully materialized deliverable for score / unverified automation.
  if (policy.materializationCompletionAuthority === true) {
    if (qualityBelow) {
      return Object.freeze({
        status: "PASS" as const,
        completionAllowed: true,
        reason: `Materialization succeeded; quality score ${qualitySummary.overallScore} observational (threshold ${policy.minQualityScore})`,
      });
    }
    return Object.freeze({
      status: "PASS" as const,
      completionAllowed: true,
      reason:
        "Materialization succeeded; mandatory hard failures absent (observational checks non-blocking)",
    });
  }

  if (qualityUnverified) {
    return Object.freeze({
      status: "UNVERIFIED" as const,
      completionAllowed: true,
      reason: `Quality not measurable: ${qualitySummary.unverified} dimension(s) unverified/not automated (measured score ${qualitySummary.measuredScore ?? "n/a"})`,
    });
  }

  if (qualityBelow && policy.allowNeedsRevision) {
    return Object.freeze({
      status: "NEEDS_REVISION" as const,
      completionAllowed: false,
      reason: `Quality score ${qualitySummary.overallScore} below threshold ${policy.minQualityScore}`,
    });
  }

  if (qualityBelow) {
    return Object.freeze({
      status: "FAIL" as const,
      completionAllowed: false,
      reason: `Quality below threshold and revision not allowed`,
    });
  }

  return Object.freeze({
    status: "PASS" as const,
    completionAllowed: true,
    reason: "All mandatory requirements pass and quality thresholds met",
  });
}

export function gateStatusToEvaluationOutcome(
  status: ValidationGateStatus,
  /** Gate completion decision — policy may withhold completion when unverified. */
  completionAllowed?: boolean,
):
  | "PASS"
  | "PASS_WITH_WARNINGS"
  | "HUMAN_REVIEW_REQUIRED"
  | "RETRY_REQUIRED"
  | "BLOCKED" {
  switch (status) {
    case "PASS":
      return "PASS";
    case "UNVERIFIED":
      // Declared policy withholding completion (or unknown) stays fail-closed;
      // when completion is allowed, could-not-verify ≠ must regenerate — a
      // human decides.
      return completionAllowed === true ? "HUMAN_REVIEW_REQUIRED" : "RETRY_REQUIRED";
    case "NEEDS_REVISION":
      return "RETRY_REQUIRED";
    case "FAIL":
      return "RETRY_REQUIRED";
    case "BLOCKED":
      return "BLOCKED";
    default:
      return "RETRY_REQUIRED";
  }
}

export function buildFailureSummary(
  requirements: readonly RequirementValidationResult[],
): OutputValidationResult["failureSummary"] {
  const failures = requirements
    .filter((r) => r.status === "FAIL")
    .map((r) =>
      Object.freeze({
        requirementId: r.requirementId,
        failureCategory: r.failureCategory ?? ("missing_requirement" as const),
        severity: r.severity,
        expected: r.expectedValue,
        actual: r.actualValue,
        evidence: r.evidence,
        repairGuidance: r.repairGuidance,
      }),
    );
  return Object.freeze({ failures: Object.freeze(failures) });
}

export function buildRepairInfo(
  requirements: readonly RequirementValidationResult[],
): readonly import("./validation-result").RepairInfo[] {
  return Object.freeze(
    requirements
      .filter((r) => r.status === "FAIL")
      .map((r) =>
        Object.freeze({
          requirementId: r.requirementId,
          failureCategory: r.failureCategory ?? ("missing_requirement" as const),
          severity: r.severity,
          expected: r.expectedValue,
          actual: r.actualValue,
          evidence: r.evidence,
          repairGuidance:
            r.repairGuidance ??
            `Fix requirement ${r.requirementId}: expected ${r.expectedValue}`,
        }),
      ),
  );
}
