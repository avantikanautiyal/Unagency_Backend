/**
 * Token budget engine — heuristic estimation.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionBudget } from "../contracts/budget";
import type { ContextOptimizationPlan } from "../contracts/context-optimization";
import type { KnowledgeOptimizationPlan } from "../contracts/knowledge-optimization";
import type { PromptOptimizationPlan } from "../contracts/prompt-optimization";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { ITokenBudgetEngine } from "../interfaces/execution-intelligence";

function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export class DefaultTokenBudgetEngine implements ITokenBudgetEngine {
  estimate(
    request: ExecutionIntelligenceRequest,
    contextPlan: ContextOptimizationPlan,
    knowledgePlan: KnowledgeOptimizationPlan,
    _promptPlan: PromptOptimizationPlan
  ): Result<ExecutionBudget> {
    const promptChars = request.compiledPrompt.messages
      .map((m) => m.content)
      .join("").length;
    const promptTokens = estimateTokens(promptChars);
    const knowledgeTokens = estimateTokens(knowledgePlan.knowledgeBudget);
    const contextTokens = estimateTokens(contextPlan.optimizedSize);
    const maxBudget = request.preferences?.maxTokenBudget ?? 128000;
    const reasoningBudget = Math.min(4096, Math.round(maxBudget * 0.1));
    const responseBudget = Math.min(8192, Math.round(maxBudget * 0.15));
    const reserveBudget = Math.round(maxBudget * 0.05);
    const totalEstimated =
      promptTokens + knowledgeTokens + contextTokens + reasoningBudget + responseBudget;
    const maximumContext = maxBudget - responseBudget - reserveBudget;
    const compressionRatio =
      totalEstimated > maximumContext
        ? maximumContext / totalEstimated
        : 1;

    return success({
      promptTokens,
      knowledgeTokens,
      reasoningBudget,
      responseBudget,
      reserveBudget,
      maximumContext,
      totalEstimated,
      compressionRatio,
    });
  }
}
