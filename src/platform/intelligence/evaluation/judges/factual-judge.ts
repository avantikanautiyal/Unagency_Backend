/**
 * Placeholder factual consistency judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding } from "./base-judge";

export class FactualJudge extends PlaceholderJudge {
  readonly kind = "factual" as const;
  readonly judgeId = "judge_factual_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const memory = context.request.memorySnapshot;
    const findings: EvaluationFinding[] = [];
    let score = 0.65;

    if (memory?.records?.length) {
      score += 0.15;
    }

    const citations = output?.citations;
    if (Array.isArray(citations) && citations.length > 0) {
      score += 0.15;
    } else {
      findings.push(
        buildFinding(criterion.id, "info", "No citations provided in output", "output.citations")
      );
    }

    if (output?.factualConflict === true) {
      findings.push(
        buildFinding(criterion.id, "error", "Factual conflict marker present", "output")
      );
      score -= 0.4;
    }

    return {
      rawScore: score,
      notes: "Placeholder factual consistency heuristic",
      findings,
    };
  }
}
