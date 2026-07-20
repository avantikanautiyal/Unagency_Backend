/**
 * Constraint analyzer.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionConstraintProfile } from "../contracts/constraints";
import type { TaskIntelligenceRequest } from "../contracts/request";
import type { TaskNode } from "../contracts/task";
import type { IConstraintAnalyzer } from "../interfaces/task-intelligence";

export class DefaultConstraintAnalyzer implements IConstraintAnalyzer {
  analyze(request: TaskIntelligenceRequest, nodes: readonly TaskNode[]): Result<ExecutionConstraintProfile> {
    const outputTokens = nodes.length * 800;
    return success({
      budgetSensitive: request.budgetHint !== undefined,
      latencySensitive: request.latencyHintMs !== undefined,
      privacyLevel: "internal",
      regionConstraints: request.regionHint ? [request.regionHint] : [],
      modelRestrictions: [],
      policyConstraints: [],
      expectedInputTokens: Math.max(500, request.rawPrompt.length * 2),
      expectedOutputTokens: outputTokens,
      rationale: "Constraints inferred from request hints and task scope",
    });
  }
}
