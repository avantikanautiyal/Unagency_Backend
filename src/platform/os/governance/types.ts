/**
 * Governance decision surface — Phase 0.
 * Missing BrandGuard / SpecGuard / production evaluation MUST NOT silently PASS.
 */

export type GovernanceCheckStatus =
  | "PASS"
  | "FAIL"
  | "NOT_IMPLEMENTED"
  | "PLACEHOLDER"
  | "SKIPPED";

export type GovernanceAction =
  | "PASS"
  | "REPAIR"
  | "REGENERATE"
  | "RETRY"
  | "HUMAN_REVIEW"
  | "REJECT"
  | "CONTINUE_WITH_GAPS";

export interface GovernanceCheckResult {
  readonly checkId: string;
  readonly status: GovernanceCheckStatus;
  readonly message: string;
}

export interface GovernanceDecision {
  readonly action: GovernanceAction;
  readonly checks: readonly GovernanceCheckResult[];
  readonly blocking: boolean;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface GovernanceInput {
  readonly evaluationScore: number | null;
  readonly evaluationPlaceholder: boolean;
  readonly humanReviewFlag: boolean;
  readonly providerSuccess: boolean;
  readonly nowIso: () => string;
}

/**
 * Phase 0 GovernanceEngine: records honesty about unimplemented guards.
 * Does NOT claim BrandGuard/SpecGuard PASS. Does NOT block delivery yet
 * (blocking reserved for later phases once guards exist) except provider failure.
 */
export class GovernanceEngine {
  decide(input: GovernanceInput): GovernanceDecision {
    const checks: GovernanceCheckResult[] = [
      {
        checkId: "evaluation",
        status: input.evaluationPlaceholder
          ? "PLACEHOLDER"
          : input.evaluationScore == null
            ? "NOT_IMPLEMENTED"
            : input.evaluationScore < 0.7
              ? "FAIL"
              : "PASS",
        message: input.evaluationPlaceholder
          ? "Evaluation judges are placeholder heuristics — not production quality signal"
          : input.evaluationScore == null
            ? "No evaluation score"
            : `score=${input.evaluationScore}`,
      },
      {
        checkId: "validation",
        status: "NOT_IMPLEMENTED",
        message: "Request-path ValidationEngine not implemented (M9.1 is offline only)",
      },
      {
        checkId: "brand_guard",
        status: "NOT_IMPLEMENTED",
        message: "BrandGuard not implemented",
      },
      {
        checkId: "spec_guard",
        status: "NOT_IMPLEMENTED",
        message: "SpecGuard not implemented",
      },
      {
        checkId: "safety_policy",
        status: "NOT_IMPLEMENTED",
        message: "Client/global safety policy engine not implemented as delivery gate",
      },
      {
        checkId: "provider_runtime",
        status: input.providerSuccess ? "PASS" : "FAIL",
        message: input.providerSuccess
          ? "Provider runtime reported success"
          : "Provider runtime reported failure",
      },
    ];

    if (!input.providerSuccess) {
      return {
        action: "REJECT",
        checks,
        blocking: true,
        reason: "Provider execution failed",
        decidedAt: input.nowIso(),
      };
    }

    if (input.humanReviewFlag) {
      return {
        action: "HUMAN_REVIEW",
        checks,
        blocking: false,
        reason:
          "humanReviewRequired flagged — Phase 0 does not enforce a review queue (tool approval only)",
        decidedAt: input.nowIso(),
      };
    }

    const unimplemented = checks.filter((c) => c.status === "NOT_IMPLEMENTED" || c.status === "PLACEHOLDER");
    return {
      action: "CONTINUE_WITH_GAPS",
      checks,
      blocking: false,
      reason: `Phase 0 delivery continues with explicit gaps: ${unimplemented
        .map((c) => c.checkId)
        .join(", ")}`,
      decidedAt: input.nowIso(),
    };
  }
}

export const defaultGovernanceEngine = new GovernanceEngine();
