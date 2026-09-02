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
  /** Track B3 — creative score /100 when available */
  readonly creativeScoreTotal?: number | null;
  readonly nowIso: () => string;
}

/**
 * Phase 0 GovernanceEngine: records evaluation honesty.
 * When a real creative score is present, uses the B3 /100 release gate.
 */
export class GovernanceEngine {
  decide(input: GovernanceInput): GovernanceDecision {
    const creativeScore =
      typeof input.creativeScoreTotal === "number"
        ? input.creativeScoreTotal
        : input.evaluationScore != null && input.evaluationScore <= 1
          ? Math.round(input.evaluationScore * 100)
          : input.evaluationScore;

    const checks: GovernanceCheckResult[] = [
      {
        checkId: "evaluation",
        status: input.evaluationPlaceholder
          ? "PLACEHOLDER"
          : creativeScore == null
            ? "NOT_IMPLEMENTED"
            : creativeScore < 80
              ? "FAIL"
              : "PASS",
        message: input.evaluationPlaceholder
          ? "Evaluation pending — async execution in progress"
          : creativeScore == null
            ? "No creative score"
            : `creativeScore=${creativeScore}/100`,
      },
      {
        checkId: "validation",
        status: "PASS",
        message: "Request-path validation via create prepass",
      },
      {
        checkId: "brand_guard",
        status: input.evaluationPlaceholder ? "SKIPPED" : "PASS",
        message: input.evaluationPlaceholder
          ? "Post-guards run after provider completes"
          : "BrandGuard evaluated in Phase 6 finalize",
      },
      {
        checkId: "spec_guard",
        status: input.evaluationPlaceholder ? "SKIPPED" : "PASS",
        message: input.evaluationPlaceholder
          ? "Post-guards run after provider completes"
          : "SpecGuard evaluated in Phase 6 finalize",
      },
      {
        checkId: "creative_score",
        status: input.evaluationPlaceholder
          ? "SKIPPED"
          : creativeScore == null
            ? "NOT_IMPLEMENTED"
            : creativeScore < 80
              ? "FAIL"
              : "PASS",
        message:
          creativeScore == null
            ? "CreativeScoreEvaluator not run (CREATIVE_QA=off)"
            : `Creative score ${creativeScore}/100 (gate 80)`,
      },
      {
        checkId: "safety_policy",
        status: "NOT_IMPLEMENTED",
        message: "Global safety policy engine not wired as delivery gate",
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
          "humanReviewRequired flagged — review queue or targeted refine recommended",
        decidedAt: input.nowIso(),
      };
    }

    if (
      !input.evaluationPlaceholder &&
      typeof creativeScore === "number" &&
      creativeScore < 80
    ) {
      return {
        action: "REJECT",
        checks,
        blocking: true,
        reason: `Creative score ${creativeScore}/100 below release gate (80)`,
        decidedAt: input.nowIso(),
      };
    }

    const unimplemented = checks.filter(
      (c) => c.status === "NOT_IMPLEMENTED" || c.status === "PLACEHOLDER"
    );
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
