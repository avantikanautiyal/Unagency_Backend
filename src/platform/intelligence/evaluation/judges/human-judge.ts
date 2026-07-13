/**
 * Placeholder human review signal judge.
 * Does NOT perform human review — emits disposition signals only.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding } from "./base-judge";

export class HumanJudge extends PlaceholderJudge {
  readonly kind = "human" as const;
  readonly judgeId = "judge_human_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const findings: EvaluationFinding[] = [];
    let score = 0.5;

    if (output?.requiresHumanReview === true) {
      findings.push(
        buildFinding(
          criterion.id,
          "warning",
          "Output marked as requiring human review",
          "output.requiresHumanReview"
        )
      );
      score = 0.2;
    }

    if (context.request.attributes?.humanReviewRequested === true) {
      score = Math.min(score, 0.35);
      findings.push(
        buildFinding(criterion.id, "info", "Human review explicitly requested", "attributes")
      );
    }

    return {
      rawScore: score,
      notes: "Placeholder human review signal — no human review performed",
      findings,
    };
  }
}
