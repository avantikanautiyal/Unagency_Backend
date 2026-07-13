/**
 * Placeholder hallucination risk judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding } from "./base-judge";

export class HallucinationJudge extends PlaceholderJudge {
  readonly kind = "hallucination" as const;
  readonly judgeId = "judge_hallucination_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const findings: EvaluationFinding[] = [];
    let score = 0.75;

    if (output?.hallucinationRisk === "high") {
      findings.push(
        buildFinding(criterion.id, "error", "High hallucination risk marker", "output")
      );
      score -= 0.45;
    } else if (output?.hallucinationRisk === "medium") {
      findings.push(
        buildFinding(criterion.id, "warning", "Medium hallucination risk marker", "output")
      );
      score -= 0.2;
    }

    const unsupportedClaims = output?.unsupportedClaims;
    if (Array.isArray(unsupportedClaims) && unsupportedClaims.length > 0) {
      findings.push(
        buildFinding(
          criterion.id,
          "warning",
          `${unsupportedClaims.length} unsupported claim(s) flagged`,
          "output.unsupportedClaims"
        )
      );
      score -= Math.min(0.3, unsupportedClaims.length * 0.1);
    }

    if (context.request.memorySnapshot?.records?.length) {
      score += 0.05;
    }

    return {
      rawScore: score,
      notes: "Placeholder hallucination risk heuristic",
      findings,
    };
  }
}
