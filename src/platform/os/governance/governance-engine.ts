/**
 * Phase 6 Governance Engine — maps AggregateEvaluation → control decisions.
 * Evaluators never mutate execution; only this engine decides.
 */

import type {
  GovernanceAction,
  GovernanceCheckResult,
  GovernanceDecision,
  GovernanceInput,
} from "./types";
import { GovernanceEngine as LegacyGovernanceEngine } from "./types";
import {
  createDefaultGovernancePolicy,
  type GovernanceDecisionAction,
  type GovernancePolicy,
} from "./policy";
import type { AggregateEvaluation } from "../evaluation/engine/evaluation-engine";
import type { EvaluationOutcome } from "../evaluation/contracts/evaluation-result";

export interface OsGovernanceDecision {
  readonly decisionId: string;
  readonly action: GovernanceDecisionAction;
  /** Legacy OS GovernanceAction for extras compatibility */
  readonly legacyAction: GovernanceAction;
  readonly blocking: boolean;
  readonly reason: string;
  readonly decidedAt: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly evaluationIds: readonly string[];
  readonly checks: readonly GovernanceCheckResult[];
  readonly scope: "task" | "execution";
  readonly taskId?: string;
  readonly organizationId: string;
  readonly executionId: string;
}

export interface IOsGovernanceEngine {
  readonly implementationStatus: "implemented";
  decideFromEvaluation(input: {
    readonly aggregate: AggregateEvaluation;
    readonly policy?: GovernancePolicy;
    readonly scope: "task" | "execution";
    readonly providerSuccess?: boolean;
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): OsGovernanceDecision;
  /** Phase 0-compatible API for single-capability finalize path */
  decide(input: GovernanceInput): GovernanceDecision;
}

function mapOutcomeToAction(
  outcome: EvaluationOutcome,
  policy: GovernancePolicy,
  scope: "task" | "execution",
  scores: AggregateEvaluation["aggregateScores"]
): { action: GovernanceDecisionAction; blocking: boolean; reason: string } {
  if (outcome === "BLOCKED") {
    return {
      action: "BLOCK",
      blocking: true,
      reason: "Evaluation outcome BLOCKED (e.g. brand/policy critical)",
    };
  }
  if (outcome === "REJECTED") {
    return {
      action: "REJECT",
      blocking: true,
      reason: "Evaluation outcome REJECTED",
    };
  }
  if (outcome === "RETRY_REQUIRED") {
    if (policy.rules.retryOnSpecFailure || scope === "task") {
      return {
        action: "RETRY",
        blocking: false,
        reason: "Evaluation requires repairable retry",
      };
    }
    return {
      action: "REJECT",
      blocking: true,
      reason: "Retry disabled by policy for this failure",
    };
  }
  if (outcome === "HUMAN_REVIEW_REQUIRED") {
    return {
      action: "HUMAN_REVIEW",
      blocking: false,
      reason: "Evaluation requires human review",
    };
  }
  if (
    typeof scores.riskScore === "number" &&
    scores.riskScore >= policy.rules.humanReviewRiskThreshold
  ) {
    return {
      action: "HUMAN_REVIEW",
      blocking: false,
      reason: `Risk score ${scores.riskScore} exceeds policy threshold`,
    };
  }

  if (scope === "execution") {
    const overall = scores.overallScore ?? 1;
    if (overall < policy.rules.approveMinOverallScore) {
      return {
        action: "HUMAN_REVIEW",
        blocking: false,
        reason: `Execution overall score ${overall} below approve threshold`,
      };
    }
    return {
      action: "APPROVE",
      blocking: false,
      reason: "All required evaluations passed under policy",
    };
  }

  // task scope
  if (outcome === "PASS_WITH_WARNINGS") {
    return {
      action: "CONTINUE",
      blocking: false,
      reason: "Task passed with warnings",
    };
  }
  return {
    action: "CONTINUE",
    blocking: false,
    reason: "Task evaluations passed",
  };
}

function toLegacyAction(action: GovernanceDecisionAction): GovernanceAction {
  switch (action) {
    case "APPROVE":
    case "CONTINUE":
      return "PASS";
    case "RETRY":
      return "RETRY";
    case "HUMAN_REVIEW":
      return "HUMAN_REVIEW";
    case "BLOCK":
    case "REJECT":
      return "REJECT";
    default:
      return "CONTINUE_WITH_GAPS";
  }
}

export class OsGovernanceEngine implements IOsGovernanceEngine {
  readonly implementationStatus = "implemented" as const;

  constructor(private readonly defaultPolicy?: GovernancePolicy) {}

  decideFromEvaluation(input: {
    readonly aggregate: AggregateEvaluation;
    readonly policy?: GovernancePolicy;
    readonly scope: "task" | "execution";
    readonly providerSuccess?: boolean;
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): OsGovernanceDecision {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const policy =
      input.policy ??
      this.defaultPolicy ??
      createDefaultGovernancePolicy(input.aggregate.organizationId, nowIso);

    if (
      policy.organizationId !== "*" &&
      policy.organizationId !== input.aggregate.organizationId
    ) {
      return {
        decisionId: createId("gdec"),
        action: "BLOCK",
        legacyAction: "REJECT",
        blocking: true,
        reason: "Governance policy organization mismatch",
        decidedAt: nowIso(),
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        evaluationIds: input.aggregate.results.map((r) => r.evaluationId),
        checks: [
          {
            checkId: "tenant",
            status: "FAIL",
            message: "Policy tenant isolation violation",
          },
        ],
        scope: input.scope,
        taskId: input.aggregate.taskId,
        organizationId: input.aggregate.organizationId,
        executionId: input.aggregate.executionId,
      };
    }

    if (input.providerSuccess === false) {
      return {
        decisionId: createId("gdec"),
        action: "REJECT",
        legacyAction: "REJECT",
        blocking: true,
        reason: "Provider execution failed",
        decidedAt: nowIso(),
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        evaluationIds: input.aggregate.results.map((r) => r.evaluationId),
        checks: [
          {
            checkId: "provider_runtime",
            status: "FAIL",
            message: "Provider runtime reported failure",
          },
        ],
        scope: input.scope,
        taskId: input.aggregate.taskId,
        organizationId: input.aggregate.organizationId,
        executionId: input.aggregate.executionId,
      };
    }

    const checks: GovernanceCheckResult[] = input.aggregate.results.map((r) => ({
      checkId: r.evaluatorId,
      status:
        r.outcome === "PASS" || r.outcome === "PASS_WITH_WARNINGS"
          ? ("PASS" as const)
          : r.outcome === "HUMAN_REVIEW_REQUIRED"
            ? ("PASS" as const)
            : ("FAIL" as const),
      message: `${r.outcome}: ${r.findings.map((f) => f.code).join(",") || "ok"}`,
    }));

    // Brand critical hard-block when policy says so
    const brandCritical = input.aggregate.results.some(
      (r) =>
        r.evaluatorId === "brand_guard" &&
        (r.outcome === "BLOCKED" ||
          r.findings.some((f) => f.severity === "critical"))
    );
    let mapped = mapOutcomeToAction(
      input.aggregate.worstOutcome,
      policy,
      input.scope,
      input.aggregate.aggregateScores
    );
    if (brandCritical && policy.rules.blockOnBrandCritical) {
      mapped = {
        action: "BLOCK",
        blocking: true,
        reason: "BrandGuard critical violation — policy blocks",
      };
    }

    return {
      decisionId: createId("gdec"),
      action: mapped.action,
      legacyAction: toLegacyAction(mapped.action),
      blocking: mapped.blocking,
      reason: mapped.reason,
      decidedAt: nowIso(),
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      evaluationIds: input.aggregate.results.map((r) => r.evaluationId),
      checks,
      scope: input.scope,
      taskId: input.aggregate.taskId,
      organizationId: input.aggregate.organizationId,
      executionId: input.aggregate.executionId,
    };
  }

  /** Backward-compatible Phase 0 decide used by single-capability finalize */
  decide(input: GovernanceInput): GovernanceDecision {
    return new LegacyGovernanceEngine().decide(input);
  }
}

export function createOsGovernanceEngine(
  policy?: GovernancePolicy
): IOsGovernanceEngine {
  return new OsGovernanceEngine(policy);
}
