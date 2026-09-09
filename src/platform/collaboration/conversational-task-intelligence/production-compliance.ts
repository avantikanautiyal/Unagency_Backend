/**
 * Bridge Format & Production Spec release gate → deliverable compliance checks.
 * Phase 3 — hygiene Gate/Weighted map into compliance results + release decision.
 */

import {
  evaluateProductionReleaseGate,
  resolveProductionRule,
  type EvaluateProductionReleaseGateInput,
  type ProductionReleaseDecision,
  type ProductionReleaseGateResult,
} from "../../config/format-production-spec";
import type { CanonicalExecutionSpecification } from "./execution-specification";
import type { DeliverableComplianceResult } from "./deliverable-compliance";

export type ProductionComplianceContext = {
  readonly platform?: string;
  readonly formatId?: string;
  readonly placementId?: string;
  readonly confirmedOverride?: boolean;
  readonly productionReleaseEligible?: boolean;
  readonly failedGateHygieneIds?: readonly string[];
  readonly evidencedGateHygieneIds?: readonly string[];
  readonly weightedExceptionIds?: readonly string[];
  readonly blockOnReview?: boolean;
};

export function resolveProductionContextFromSpec(
  spec: CanonicalExecutionSpecification,
  production?: ProductionComplianceContext,
): EvaluateProductionReleaseGateInput {
  return {
    service: spec.task.service?.value,
    subtype: spec.task.subtype?.value,
    platform: production?.platform ?? spec.technical.platform?.value,
    formatId: production?.formatId,
    placementId: production?.placementId,
    confirmedOverride: production?.confirmedOverride,
    dimensionsAreExplicit: spec.technical.width?.provenance.explicit === true,
    productionReleaseEligible: production?.productionReleaseEligible,
    failedGateHygieneIds: production?.failedGateHygieneIds,
    evidencedGateHygieneIds: production?.evidencedGateHygieneIds,
    weightedExceptionIds: production?.weightedExceptionIds,
    blockOnReview: production?.blockOnReview,
  };
}

export function dimensionsAreHardConstraint(
  spec: CanonicalExecutionSpecification,
  production?: ProductionComplianceContext,
): boolean {
  if (spec.technical.width?.provenance.explicit) return true;
  const resolved = resolveProductionRule(
    resolveProductionContextFromSpec(spec, production),
  );
  return resolved?.rule.status === "V";
}

export function evaluateProductionComplianceChecks(input: {
  readonly spec: CanonicalExecutionSpecification;
  readonly production?: ProductionComplianceContext;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
}): {
  readonly gate: ProductionReleaseGateResult;
  readonly decision: ProductionReleaseDecision;
  readonly results: readonly DeliverableComplianceResult[];
} {
  const gate = evaluateProductionReleaseGate({
    ...resolveProductionContextFromSpec(input.spec, input.production),
    generatedWidth: input.generatedWidth,
    generatedHeight: input.generatedHeight,
  });

  const results: DeliverableComplianceResult[] = [];

  for (const check of gate.checks) {
    if (check.status === "PASS") {
      results.push(
        Object.freeze({
          checkId: check.id,
          status: "PASS" as const,
          method: "MEASURED" as const,
          evidence: Object.freeze([check.evidence]),
        }),
      );
      continue;
    }
    if (check.status === "WARN") {
      const isHygieneReview = check.id.startsWith("hygiene.");
      results.push(
        Object.freeze({
          checkId: check.id,
          status: isHygieneReview
            ? ("NOT_AUTOMATED" as const)
            : ("FAIL" as const),
          method: isHygieneReview
            ? ("NOT_AUTOMATED" as const)
            : ("MEASURED" as const),
          softFailure: true,
          evidence: Object.freeze([check.evidence]),
        }),
      );
      continue;
    }
    results.push(
      Object.freeze({
        checkId: check.id,
        status: "FAIL" as const,
        method: "MEASURED" as const,
        evidence: Object.freeze([check.evidence]),
      }),
    );
  }

  // Weighted open targets — informational soft rows (never hard-fail alone).
  for (const id of gate.hygiene.weightedOpen) {
    results.push(
      Object.freeze({
        checkId: `hygiene.weighted.${id}`,
        status: "NOT_AUTOMATED" as const,
        method: "NOT_AUTOMATED" as const,
        softFailure: true,
        evidence: Object.freeze([
          `Weighted house target "${id}" open — record exception if departing`,
        ]),
      }),
    );
  }

  return Object.freeze({
    gate,
    decision: gate.decision,
    results: Object.freeze(results),
  });
}

export function isHardComplianceFailure(result: {
  readonly checkId: string;
  readonly status: string;
  readonly softFailure?: boolean;
}): boolean {
  if (result.status !== "FAIL") return false;
  if (result.softFailure) return false;
  return (
    result.checkId.startsWith("negative.") ||
    result.checkId.startsWith("brand_asset.") ||
    result.checkId.startsWith("authoritative_logo.") ||
    result.checkId.startsWith("production.") ||
    (result.checkId.startsWith("hygiene.") &&
      !result.checkId.startsWith("hygiene.weighted.")) ||
    (result.checkId === "technical.dimensions" && !result.softFailure)
  );
}
