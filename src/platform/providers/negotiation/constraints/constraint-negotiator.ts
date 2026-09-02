/**
 * Constraint negotiator.
 *
 * Purpose: Validate and negotiate execution constraints.
 * Responsibilities: timeout, retry, budget, latency, priority, execution mode,
 *   human review, evaluation policy.
 * Usage: Constraint stage of the negotiation pipeline.
 * Future Extension: Latency SLO negotiation from provider metrics.
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../core/result";
import type { IProviderRegistry } from "../../registry/provider-registry";
import type { NegotiationConstraint } from "../contracts/negotiation-constraint";
import type { NegotiationContext } from "../interfaces/context";
import type { IConstraintNegotiator } from "../interfaces/negotiators";

function minDefined(...values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length === 0 ? undefined : Math.min(...present);
}

export class ConstraintNegotiator implements IConstraintNegotiator {
  constructor(
    private readonly providerRegistry: IProviderRegistry,
    private readonly capabilityRegistry: ICapabilityRegistry
  ) {}

  negotiate(
    context: NegotiationContext
  ): Result<readonly NegotiationConstraint[]> {
    const plan = context.request.plan;
    const constraints: NegotiationConstraint[] = [];

    const providerResult = this.providerRegistry.resolveProvider(
      context.providerId
    );
    const capabilityResult = this.capabilityRegistry.resolve(plan.capabilityId);
    const provider = providerResult.ok ? providerResult.value : undefined;
    const capability = capabilityResult.ok ? capabilityResult.value : undefined;

    // Timeout: cap plan timeout by provider max + capability max duration.
    const requestedTimeout = plan.timeout.timeoutMs;
    const timeoutCap = minDefined(
      provider?.timeoutLimits.maxTimeoutMs,
      capability?.constraints.maxDuration?.maxDurationMs
    );
    const negotiatedTimeout =
      timeoutCap === undefined
        ? requestedTimeout
        : Math.min(requestedTimeout, timeoutCap);
    constraints.push({
      kind: "timeout",
      satisfied: negotiatedTimeout > 0,
      requested: requestedTimeout,
      negotiated: negotiatedTimeout,
      reason:
        negotiatedTimeout < requestedTimeout
          ? "timeout capped by provider/capability limit"
          : undefined,
    });

    // Retry.
    constraints.push({
      kind: "retry",
      satisfied: plan.retry.maxAttempts >= 1,
      requested: plan.retry.maxAttempts,
      negotiated: plan.retry.maxAttempts,
    });

    // Budget (cost ceiling).
    const requestedCost = plan.budget.maxCost;
    const budgetCap = minDefined(
      capability?.costLimit.maxCost,
      capability?.constraints.maxCost?.maxCost,
      context.request.costCeiling
    );
    const negotiatedCost = minDefined(requestedCost, budgetCap);
    const budgetSatisfied =
      requestedCost === undefined ||
      budgetCap === undefined ||
      requestedCost <= budgetCap;
    constraints.push({
      kind: "budget",
      satisfied: budgetSatisfied,
      requested: requestedCost,
      negotiated: negotiatedCost,
      reason: budgetSatisfied
        ? undefined
        : "planned cost exceeds capability/ceiling budget",
    });

    // Latency (placeholder — always satisfied; recorded for evidence).
    constraints.push({
      kind: "latency",
      satisfied: true,
      reason: "latency negotiation is a placeholder",
    });

    // Priority.
    constraints.push({
      kind: "priority",
      satisfied: true,
      negotiated: plan.priority,
    });

    // Execution mode.
    constraints.push({
      kind: "execution_mode",
      satisfied: true,
      negotiated: plan.executionMode,
    });

    // Human review.
    const humanReview =
      plan.humanReview.required ||
      capability?.humanReviewPolicy.required === true ||
      capability?.constraints.humanReviewRequired?.required === true;
    constraints.push({
      kind: "human_review",
      satisfied: true,
      negotiated: humanReview,
    });

    // Evaluation.
    const evaluation =
      plan.evaluation.enabled ||
      capability?.evaluationStrategy.enabled === true;
    constraints.push({
      kind: "evaluation",
      satisfied: true,
      negotiated: evaluation,
    });

    return success(constraints);
  }
}
