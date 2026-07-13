/**
 * Budget negotiator.
 *
 * Purpose: Validate a plan's budget against capability/tenant/ceiling limits.
 * Responsibilities: Compute the negotiated cost ceiling. No billing/persistence.
 * Usage: Budget stage of the negotiation pipeline.
 * Future Extension: Real budget ledgers (still no persistence here).
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../shared/result";
import type { BudgetEvaluation } from "../contracts/evaluations";
import type { NegotiationContext } from "../interfaces/context";
import type { IBudgetNegotiator } from "../interfaces/negotiators";

function minDefined(...values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length === 0 ? undefined : Math.min(...present);
}

export class BudgetNegotiator implements IBudgetNegotiator {
  constructor(private readonly capabilityRegistry: ICapabilityRegistry) {}

  negotiate(context: NegotiationContext): Result<BudgetEvaluation> {
    const plan = context.request.plan;
    const reasons: string[] = [];

    const capabilityResult = this.capabilityRegistry.resolve(plan.capabilityId);
    const capability = capabilityResult.ok ? capabilityResult.value : undefined;

    const plannedCost = plan.budget.maxCost;
    const ceiling = minDefined(
      capability?.costLimit.maxCost,
      capability?.constraints.maxCost?.maxCost,
      context.request.costCeiling
    );

    const withinBudget =
      plannedCost === undefined || ceiling === undefined || plannedCost <= ceiling;
    if (!withinBudget) {
      reasons.push(
        `planned cost ${plannedCost} exceeds ceiling ${ceiling}`
      );
    }

    const maxTokens = minDefined(
      plan.budget.maxTokens,
      capability?.costLimit.maxTokens,
      capability?.constraints.maxTokens?.maxTokens
    );

    return success({
      withinBudget,
      maxCost: minDefined(plannedCost, ceiling),
      maxTokens,
      currency: plan.budget.currency ?? capability?.costLimit.currency,
      costCeiling: ceiling,
      reasons,
    });
  }
}
