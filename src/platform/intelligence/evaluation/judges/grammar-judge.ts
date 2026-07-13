/**
 * Placeholder grammar quality judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding, outputText } from "./base-judge";

export class GrammarJudge extends PlaceholderJudge {
  readonly kind = "grammar" as const;
  readonly judgeId = "judge_grammar_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const text = outputText(context.request.executionResult.output);
    const findings: EvaluationFinding[] = [];
    let score = 0.7;

    if (!text.trim()) {
      return {
        rawScore: 0.2,
        notes: "Empty output text",
        findings: [buildFinding(criterion.id, "warning", "Empty output text", "output")],
      };
    }

    if (!/[.!?]$/.test(text.trim()) && text.length > 20) {
      findings.push(
        buildFinding(criterion.id, "info", "Output lacks terminal punctuation", "output")
      );
      score -= 0.05;
    }

    if (/\s{3,}/.test(text)) {
      findings.push(
        buildFinding(criterion.id, "warning", "Excessive whitespace detected", "output")
      );
      score -= 0.1;
    }

    if (/[A-Z]{5,}/.test(text)) {
      findings.push(
        buildFinding(criterion.id, "info", "Excessive capitalization detected", "output")
      );
      score -= 0.05;
    }

    return {
      rawScore: score,
      notes: "Placeholder grammar heuristic",
      findings,
    };
  }
}
