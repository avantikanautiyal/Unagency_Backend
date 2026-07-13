/**
 * Placeholder policy compliance judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding, outputText } from "./base-judge";

const BLOCKED_MARKERS = ["policy_violation", "restricted_content"];

export class PolicyJudge extends PlaceholderJudge {
  readonly kind = "policy" as const;
  readonly judgeId = "judge_policy_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const findings: EvaluationFinding[] = [];
    let score = 0.85;

    for (const marker of BLOCKED_MARKERS) {
      if (hasPolicyMarker(output, marker)) {
        findings.push(
          buildFinding(criterion.id, "error", `Policy marker detected: ${marker}`, "output")
        );
        score -= 0.5;
      }
    }

    const text = outputText(output).toLowerCase();
    if (text.includes("unauthorized")) {
      findings.push(
        buildFinding(criterion.id, "warning", "Unauthorized language detected", "output")
      );
      score -= 0.15;
    }

    return {
      rawScore: score,
      notes: "Placeholder policy compliance heuristic",
      findings,
    };
  }
}

function hasPolicyMarker(
  output: Readonly<Record<string, unknown>> | undefined,
  marker: string
): boolean {
  if (!output) return false;
  const flags = output.policyFlags;
  if (Array.isArray(flags) && flags.includes(marker)) return true;
  return JSON.stringify(output).includes(marker);
}
