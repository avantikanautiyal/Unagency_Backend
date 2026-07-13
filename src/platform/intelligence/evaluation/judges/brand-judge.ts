/**
 * Placeholder brand alignment judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding, outputText } from "./base-judge";

export class BrandJudge extends PlaceholderJudge {
  readonly kind = "brand" as const;
  readonly judgeId = "judge_brand_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const prompt = context.request.compiledPrompt;
    const findings: EvaluationFinding[] = [];
    let score = 0.6;

    const brandSections =
      prompt?.document?.ast?.sections?.filter((s) => s.role === "brand").length ?? 0;
    if (brandSections > 0) {
      score += 0.2;
    }

    const text = outputText(context.request.executionResult.output).toLowerCase();
    if (text.includes("off-brand")) {
      findings.push(
        buildFinding(criterion.id, "error", "Detected off-brand marker", "output")
      );
      score -= 0.4;
    }

    return {
      rawScore: score,
      notes: "Placeholder brand alignment heuristic",
      findings,
    };
  }
}
