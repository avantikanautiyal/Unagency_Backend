/**
 * Phase 3 — Hygiene Reference release decisions (PASS / REVISE / REVIEW / HOLD).
 *
 * Instruct (Phase 1) and enforce share the same productionRuleId.
 * Gate failures that are measured/hard block release; unresolved NOT_AUTOMATED
 * gates yield REVIEW (do not treat as PASS); Weighted never blocks alone.
 */

import type { ProductionHygieneCheck, ProductionRule } from "./types";
import type {
  ProductionReleaseCheck,
  ProductionReleaseGateResult,
} from "./production-release-gate";

/** PDF RELEASE CONTROL final decision. */
export type ProductionReleaseDecision =
  | "PASS"
  | "REVISE"
  | "REVIEW"
  | "HOLD";

export type HygieneEvaluationSummary = {
  readonly gateUnresolved: readonly string[];
  readonly gateFailures: readonly string[];
  readonly weightedOpen: readonly string[];
  readonly weightedExceptions: readonly string[];
};

export type ResolveProductionReleaseDecisionInput = {
  readonly gate: ProductionReleaseGateResult;
  readonly hygiene?: HygieneEvaluationSummary;
  /**
   * Soft-path visuals (best-effort) must never be treated as approved PASS.
   */
  readonly productionReleaseEligible?: boolean;
};

function isAuthorityHold(check: ProductionReleaseCheck): boolean {
  return check.id === "production.release_authority" && check.status === "FAIL";
}

/**
 * Map gate + hygiene evidence into Hygiene Reference release decision.
 */
export function resolveProductionReleaseDecision(
  input: ResolveProductionReleaseDecisionInput,
): ProductionReleaseDecision {
  if (input.productionReleaseEligible === false) {
    return "HOLD";
  }

  const blocking = input.gate.checks.filter(
    (c) => c.blocksRelease && c.status === "FAIL",
  );
  if (blocking.length > 0) {
    if (blocking.some(isAuthorityHold) || input.gate.rule?.status === "H") {
      return "HOLD";
    }
    if (input.gate.rule?.status === "R") {
      return "HOLD";
    }
    return "REVISE";
  }

  const unresolved = input.hygiene?.gateUnresolved ?? [];
  const gateFailures = input.hygiene?.gateFailures ?? [];
  if (gateFailures.length > 0) {
    return "REVISE";
  }
  if (unresolved.length > 0) {
    return "REVIEW";
  }

  return "PASS";
}

/**
 * Build hygiene evaluation summary from Spec checks + optional evidence.
 *
 * - Gate + NOT_AUTOMATED without evidence → unresolved (REVIEW)
 * - Gate + listed failure ids → gateFailures (REVISE)
 * - Weighted without exception record → weightedOpen (informational)
 * - Weighted listed in exceptions → weightedExceptions
 */
export function evaluateHygieneEvidence(input: {
  readonly rule?: ProductionRule;
  /** Gate hygiene ids that failed a measured/heuristic check. */
  readonly failedGateIds?: readonly string[];
  /** Gate hygiene ids with recorded proof/pass evidence. */
  readonly evidencedGateIds?: readonly string[];
  /** Weighted hygiene ids with justified exceptions. */
  readonly weightedExceptionIds?: readonly string[];
}): HygieneEvaluationSummary {
  const checks = input.rule?.hygieneChecks ?? [];
  const failed = new Set(input.failedGateIds ?? []);
  const evidenced = new Set(input.evidencedGateIds ?? []);
  const exceptions = new Set(input.weightedExceptionIds ?? []);

  const gateUnresolved: string[] = [];
  const gateFailures: string[] = [];
  const weightedOpen: string[] = [];
  const weightedExceptions: string[] = [];

  for (const check of checks) {
    summarizeOneCheck(check, {
      failed,
      evidenced,
      exceptions,
      gateUnresolved,
      gateFailures,
      weightedOpen,
      weightedExceptions,
    });
  }

  return Object.freeze({
    gateUnresolved: Object.freeze(gateUnresolved),
    gateFailures: Object.freeze(gateFailures),
    weightedOpen: Object.freeze(weightedOpen),
    weightedExceptions: Object.freeze(weightedExceptions),
  });
}

function summarizeOneCheck(
  check: ProductionHygieneCheck,
  ctx: {
    readonly failed: ReadonlySet<string>;
    readonly evidenced: ReadonlySet<string>;
    readonly exceptions: ReadonlySet<string>;
    readonly gateUnresolved: string[];
    readonly gateFailures: string[];
    readonly weightedOpen: string[];
    readonly weightedExceptions: string[];
  },
): void {
  if (check.weight === "weighted") {
    if (ctx.exceptions.has(check.id)) {
      ctx.weightedExceptions.push(check.id);
    } else {
      ctx.weightedOpen.push(check.id);
    }
    return;
  }

  if (ctx.failed.has(check.id)) {
    ctx.gateFailures.push(check.id);
    return;
  }
  if (ctx.evidenced.has(check.id)) {
    return;
  }
  // MEASURED gates without caller evidence stay unresolved unless already
  // covered by production.canvas_dimensions in the release gate.
  if (
    check.evaluationMethod === "MEASURED" &&
    check.id === "technical"
  ) {
    // Canvas/authority handled by release gate checks; do not double-count.
    return;
  }
  ctx.gateUnresolved.push(check.id);
}

/**
 * Whether an approved publish/delivery should proceed for this decision.
 * REVIEW does not auto-block (Admin may still hold publish); HOLD/REVISE do.
 */
export function isDecisionDeliveryBlocked(
  decision: ProductionReleaseDecision,
  options?: { readonly blockOnReview?: boolean },
): boolean {
  if (decision === "HOLD" || decision === "REVISE") return true;
  if (options?.blockOnReview && decision === "REVIEW") return true;
  return false;
}
