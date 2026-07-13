/**
 * Placeholder instruction adherence judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import {
  PlaceholderJudge,
  buildFinding,
  hasOutputKey,
  outputText,
} from "./base-judge";

export class InstructionJudge extends PlaceholderJudge {
  readonly kind = "instruction" as const;
  readonly judgeId = "judge_instruction_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const prompt = context.request.compiledPrompt;
    const findings: EvaluationFinding[] = [];

    let score = 0.5;
    if (context.request.executionResult.success) {
      score += 0.2;
    }
    if (hasOutputKey(output, "message") || hasOutputKey(output, "text")) {
      score += 0.2;
    }
    if (prompt?.document?.ast?.sections?.length) {
      score += 0.1;
    }

    const text = outputText(output);
    if (text.length < 3) {
      findings.push(
        buildFinding(criterion.id, "warning", "Output text is very short", "output")
      );
      score -= 0.2;
    }

    return {
      rawScore: score,
      notes: "Placeholder instruction adherence heuristic",
      findings,
    };
  }
}
