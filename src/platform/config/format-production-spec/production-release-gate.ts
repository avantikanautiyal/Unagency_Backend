/**
 * Phase B/3 — Production release gate from Format & Production Spec authority.
 *
 * V: exact canvas mismatch blocks approved release.
 * D: canvas mismatch warns but does not block.
 * R/H: block until a confirmed override is supplied.
 * Soft-path (productionReleaseEligible=false): HOLD.
 * Hygiene Gate/Weighted feed PASS/REVISE/REVIEW/HOLD decisions.
 */

import {
  evaluateHygieneEvidence,
  isDecisionDeliveryBlocked,
  resolveProductionReleaseDecision,
  type HygieneEvaluationSummary,
  type ProductionReleaseDecision,
} from "./production-release-decision";
import {
  isProductionRuleReleasable,
  resolveProductionRule,
} from "./resolve-production-rule";
import type { ProductionRule, ResolveProductionRuleInput } from "./types";

export type ProductionReleaseCheckStatus = "PASS" | "FAIL" | "WARN";

export type ProductionReleaseCheck = {
  readonly id: string;
  readonly status: ProductionReleaseCheckStatus;
  readonly evidence: string;
  /** When true, this check blocks approved release / delivery. */
  readonly blocksRelease: boolean;
};

export type ProductionReleaseGateResult = {
  readonly allowed: boolean;
  readonly status: "PASS" | "WARN" | "BLOCK";
  /** Hygiene Reference release-control decision. */
  readonly decision: ProductionReleaseDecision;
  readonly rule?: ProductionRule;
  readonly reasons: readonly string[];
  readonly checks: readonly ProductionReleaseCheck[];
  readonly hygiene: HygieneEvaluationSummary;
};

export type EvaluateProductionReleaseGateInput = ResolveProductionRuleInput & {
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  /**
   * When true, R/H placements may proceed (booked/vendor/legal override recorded).
   * Does not waive V exact-canvas failures.
   */
  readonly confirmedOverride?: boolean;
  /**
   * When true, treat dimension mismatch as blocking even for D defaults
   * (e.g. user explicitly requested these pixels).
   */
  readonly dimensionsAreExplicit?: boolean;
  /** Soft-path / best-effort outputs are never approved PASS. */
  readonly productionReleaseEligible?: boolean;
  /** Gate hygiene ids that failed measured/heuristic evaluation. */
  readonly failedGateHygieneIds?: readonly string[];
  /** Gate hygiene ids with recorded pass evidence. */
  readonly evidencedGateHygieneIds?: readonly string[];
  /** Weighted hygiene ids with justified exceptions. */
  readonly weightedExceptionIds?: readonly string[];
  /**
   * When true, REVIEW decisions (unresolved Gate evidence) also block delivery.
   * Default false — surfaces REVIEW without hard-stopping every ship.
   */
  readonly blockOnReview?: boolean;
};

function freezeCheck(check: ProductionReleaseCheck): ProductionReleaseCheck {
  return Object.freeze(check);
}

/**
 * Evaluate whether an approved release/delivery is allowed for this placement.
 * No matching rule → PASS (gate only applies when Spec has a rule).
 */
export function evaluateProductionReleaseGate(
  input: EvaluateProductionReleaseGateInput,
): ProductionReleaseGateResult {
  const resolved = resolveProductionRule(input);
  if (!resolved) {
    return Object.freeze({
      allowed: true,
      status: "PASS" as const,
      decision: "PASS" as const,
      reasons: Object.freeze(["No production rule matched — gate not applicable"]),
      checks: Object.freeze([]),
      hygiene: Object.freeze({
        gateUnresolved: Object.freeze([]),
        gateFailures: Object.freeze([]),
        weightedOpen: Object.freeze([]),
        weightedExceptions: Object.freeze([]),
      }),
    });
  }

  const rule = resolved.rule;
  const checks: ProductionReleaseCheck[] = [];
  const reasons: string[] = [];

  if (input.productionReleaseEligible === false) {
    checks.push(
      freezeCheck({
        id: "production.soft_path",
        status: "FAIL",
        evidence:
          "Best-effort / soft-path visual is not production-release eligible",
        blocksRelease: true,
      }),
    );
    reasons.push("PRODUCTION_RELEASE_HOLD: soft-path output cannot be approved");
  }

  const releasable = isProductionRuleReleasable(rule);
  if (!releasable) {
    if (input.confirmedOverride) {
      checks.push(
        freezeCheck({
          id: "production.release_authority",
          status: "WARN",
          evidence: `Status ${rule.status} placement ${rule.id} proceeding with confirmed override`,
          blocksRelease: false,
        }),
      );
      reasons.push(`Confirmed override for status ${rule.status} placement ${rule.id}`);
    } else {
      checks.push(
        freezeCheck({
          id: "production.release_authority",
          status: "FAIL",
          evidence:
            `Status ${rule.status} placement ${rule.id} — confirm current platform/vendor spec before approved release`,
          blocksRelease: true,
        }),
      );
      reasons.push(
        `PRODUCTION_RELEASE_HOLD: ${rule.id} is ${rule.status} — confirmation required`,
      );
    }
  } else {
    checks.push(
      freezeCheck({
        id: "production.release_authority",
        status: "PASS",
        evidence: `Status ${rule.status} placement ${rule.id} is releasable`,
        blocksRelease: false,
      }),
    );
  }

  const canvas = rule.canvas;
  if (
    canvas?.unit === "px" &&
    input.generatedWidth !== undefined &&
    input.generatedHeight !== undefined
  ) {
    const match =
      input.generatedWidth === canvas.width &&
      input.generatedHeight === canvas.height;
    const hard =
      rule.status === "V" || input.dimensionsAreExplicit === true;

    if (match) {
      checks.push(
        freezeCheck({
          id: "production.canvas_dimensions",
          status: "PASS",
          evidence: `Dimensions ${input.generatedWidth}×${input.generatedHeight} match ${rule.id}`,
          blocksRelease: false,
        }),
      );
    } else if (hard) {
      checks.push(
        freezeCheck({
          id: "production.canvas_dimensions",
          status: "FAIL",
          evidence:
            `TECHNICAL_REQUIREMENT_FAILURE: ${rule.id} requires ${canvas.width}×${canvas.height}, got ${input.generatedWidth}×${input.generatedHeight}`,
          blocksRelease: true,
        }),
      );
      reasons.push(
        `Canvas mismatch for ${rule.status} rule ${rule.id}: expected ${canvas.width}×${canvas.height}, got ${input.generatedWidth}×${input.generatedHeight}`,
      );
    } else {
      checks.push(
        freezeCheck({
          id: "production.canvas_dimensions",
          status: "WARN",
          evidence:
            `Working-default canvas drift for ${rule.id}: expected ${canvas.width}×${canvas.height}, got ${input.generatedWidth}×${input.generatedHeight}`,
          blocksRelease: false,
        }),
      );
      reasons.push(
        `WARN: D canvas drift for ${rule.id} (${input.generatedWidth}×${input.generatedHeight} vs ${canvas.width}×${canvas.height})`,
      );
    }
  }

  // Structured hygiene — Gate failures block; unresolved Gates → REVIEW decision.
  const hygiene = evaluateHygieneEvidence({
    rule,
    failedGateIds: input.failedGateHygieneIds,
    evidencedGateIds: [
      ...(input.evidencedGateHygieneIds ?? []),
      ...(checks.some(
        (c) => c.id === "production.canvas_dimensions" && c.status === "PASS",
      )
        ? (["technical"] as const)
        : []),
    ],
    weightedExceptionIds: input.weightedExceptionIds,
  });

  for (const id of hygiene.gateFailures) {
    const check = rule.hygieneChecks?.find((h) => h.id === id);
    checks.push(
      freezeCheck({
        id: `hygiene.${id}`,
        status: "FAIL",
        evidence:
          check?.passDefinition ??
          `Gate hygiene "${id}" failed for ${rule.id}`,
        blocksRelease: true,
      }),
    );
    reasons.push(`HYGIENE_GATE_FAILURE: ${id} on ${rule.id}`);
  }

  for (const id of hygiene.gateUnresolved) {
    const check = rule.hygieneChecks?.find((h) => h.id === id);
    checks.push(
      freezeCheck({
        id: `hygiene.${id}`,
        status: "WARN",
        evidence:
          `REVIEW: missing evidence for Gate "${id}" — ${check?.passDefinition ?? id}`,
        blocksRelease: false,
      }),
    );
  }

  for (const id of hygiene.weightedExceptions) {
    checks.push(
      freezeCheck({
        id: `hygiene.${id}`,
        status: "WARN",
        evidence: `Weighted hygiene "${id}" exception recorded for ${rule.id}`,
        blocksRelease: false,
      }),
    );
  }

  const blocking = checks.filter((c) => c.blocksRelease && c.status === "FAIL");
  const warnings = checks.filter((c) => c.status === "WARN");
  const allowedHard = blocking.length === 0;

  const interim: ProductionReleaseGateResult = Object.freeze({
    allowed: allowedHard,
    status: !allowedHard
      ? ("BLOCK" as const)
      : warnings.length > 0
        ? ("WARN" as const)
        : ("PASS" as const),
    decision: "PASS",
    rule,
    reasons: Object.freeze(reasons),
    checks: Object.freeze(checks),
    hygiene,
  });

  const decision = resolveProductionReleaseDecision({
    gate: interim,
    hygiene,
    productionReleaseEligible: input.productionReleaseEligible,
  });

  const allowed =
    allowedHard &&
    !isDecisionDeliveryBlocked(decision, {
      blockOnReview: input.blockOnReview === true,
    });

  return Object.freeze({
    ...interim,
    allowed,
    decision,
    status: !allowed
      ? ("BLOCK" as const)
      : warnings.length > 0 || decision === "REVIEW"
        ? ("WARN" as const)
        : ("PASS" as const),
  });
}

/** True when download/delivery should be denied for this gate result. */
export function isProductionReleaseBlocked(
  result: ProductionReleaseGateResult,
): boolean {
  return !result.allowed;
}
