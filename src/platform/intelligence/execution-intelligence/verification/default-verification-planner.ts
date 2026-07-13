/**
 * Verification planner — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionVerificationPlan } from "../contracts/verification";
import type { ExecutionQualityEstimate } from "../contracts/prediction";
import type { ExecutionStrategy } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IVerificationPlanner } from "../interfaces/execution-intelligence";

export class DefaultVerificationPlanner implements IVerificationPlanner {
  plan(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy,
    quality: ExecutionQualityEstimate
  ): Result<ExecutionVerificationPlan> {
    const enabled =
      strategy.requiresVerification ||
      quality.needsVerification ||
      request.preferences?.enableVerification === true;

    if (!enabled) {
      return success({
        enabled: false,
        steps: [],
        estimatedOverhead: 0,
        rationale: "Verification not required",
      });
    }

    const steps = [
      {
        kind: "self_review" as const,
        order: 1,
        required: true,
        description: "Model reviews its own output against instructions",
      },
      {
        kind: "schema_validation" as const,
        order: 2,
        required: request.compiledPrompt.constraints.length > 0,
        description: "Validate output against declared constraints",
      },
      {
        kind: "second_pass_refinement" as const,
        order: 3,
        required: quality.expectedQuality < 0.75,
        description: "Refine output when quality estimate is below threshold",
      },
      {
        kind: "fact_verification" as const,
        order: 4,
        required: quality.hallucinationRisk > 0.3,
        description: "Cross-check factual claims against knowledge",
      },
      {
        kind: "human_review" as const,
        order: 5,
        required: quality.hallucinationRisk > 0.5,
        description: "Escalate to human review for high hallucination risk",
      },
    ].filter((s) => s.required || s.kind === "self_review");

    return success({
      enabled: true,
      steps,
      estimatedOverhead: steps.length * 0.15,
      rationale: `Verification plan for strategy ${strategy.kind}`,
    });
  }
}
