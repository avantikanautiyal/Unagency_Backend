/**
 * Cost optimizer — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionBudget } from "../contracts/budget";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { ICostOptimizer } from "../interfaces/execution-intelligence";

export class DefaultCostOptimizer implements ICostOptimizer {
  optimize(
    request: ExecutionIntelligenceRequest,
    budget: ExecutionBudget
  ): Result<ExecutionBudget> {
    if (!request.preferences?.prioritizeCost) {
      return success(budget);
    }

    const reduction = 0.15;
    return success({
      ...budget,
      reasoningBudget: Math.round(budget.reasoningBudget * (1 - reduction)),
      knowledgeTokens: Math.round(budget.knowledgeTokens * (1 - reduction)),
      responseBudget: Math.round(budget.responseBudget * (1 - reduction * 0.5)),
      totalEstimated: Math.round(budget.totalEstimated * (1 - reduction * 0.5)),
      compressionRatio: Math.min(budget.compressionRatio, 0.85),
    });
  }
}
