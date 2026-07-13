/**
 * Reasoning planner — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionReasoningPlan } from "../contracts/reasoning";
import type { ExecutionStrategy } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IReasoningPlanner } from "../interfaces/execution-intelligence";

export class DefaultReasoningPlanner implements IReasoningPlanner {
  plan(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionReasoningPlan> {
    const enabled =
      strategy.requiresReasoning || request.preferences?.enableReasoning === true;
    const depth = enabled ? (strategy.kind === "tree_of_thought" ? 3 : 2) : 0;

    return success({
      enabled,
      depth,
      steps: enabled
        ? [
            "analyze task requirements",
            "identify constraints and success criteria",
            "formulate intermediate reasoning chain",
            ...(depth > 2 ? ["explore alternative reasoning branches"] : []),
          ]
        : [],
      estimatedTokens: enabled ? depth * 512 : 0,
      rationale: enabled
        ? `Strategy ${strategy.kind} requires reasoning depth ${depth}`
        : "Reasoning not required for selected strategy",
    });
  }
}
