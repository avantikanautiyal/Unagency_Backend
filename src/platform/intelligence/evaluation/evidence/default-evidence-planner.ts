/**
 * Evidence requirements planner.
 */

import { success, type Result } from "../../shared/result";
import type {
  DynamicEvaluationStrategy,
  EvidenceRequirements,
  JudgeExecutionPlan,
} from "../contracts/dynamic-evaluation";
import type { IEvidencePlanner } from "../interfaces/dynamic-evaluation-ports";

export class DefaultEvidencePlanner implements IEvidencePlanner {
  plan(
    strategy: DynamicEvaluationStrategy,
    plan: JudgeExecutionPlan
  ): Result<EvidenceRequirements> {
    const requirements = [
      {
        evidenceId: "execution_output",
        description: "Primary execution output artifact",
        required: true,
        sourceHint: "ExecutionResult.output",
      },
      {
        evidenceId: "capability_context",
        description: "Capability identifiers under evaluation",
        required: Boolean(strategy.capability),
        sourceHint: "CapabilityExecutionPlan",
      },
    ];

    if (strategy.experienceSignalCount > 0) {
      requirements.push({
        evidenceId: "experience_package",
        description: "Experience injection signals influencing evaluation",
        required: false,
        sourceHint: "ExecutionExperiencePackage",
      });
    }

    if (plan.humanReviewRequired) {
      requirements.push({
        evidenceId: "human_review_gate",
        description: "Human review disposition must be captured",
        required: true,
        sourceHint: "ReviewDecision",
      });
    }

    if (strategy.pipelineFamily === "healthcare") {
      requirements.push({
        evidenceId: "clinical_safety",
        description: "Clinical safety / compliance evidence",
        required: true,
        sourceHint: "Safety+Medical judges",
      });
    }

    return success({
      requirements,
      rationale: `Evidence plan for ${strategy.pipelineFamily} with ${plan.selectedJudges.length} judges.`,
    });
  }
}
