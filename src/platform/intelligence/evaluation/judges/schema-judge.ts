/**
 * Placeholder schema conformance judge.
 */

import type { EvaluationCriterion, EvaluationFinding } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";
import { PlaceholderJudge, buildFinding } from "./base-judge";

export class SchemaJudge extends PlaceholderJudge {
  readonly kind = "schema" as const;
  readonly judgeId = "judge_schema_v1";

  protected evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] } {
    const output = context.request.executionResult.output;
    const findings: EvaluationFinding[] = [];

    if (!output) {
      findings.push(
        buildFinding(criterion.id, "error", "Missing execution output", "output")
      );
      return { rawScore: 0, notes: "No output to validate", findings };
    }

    const keys = Object.keys(output);
    let score = keys.length > 0 ? 0.8 : 0.3;

    const expectedSchema = context.request.attributes?.expectedSchema;
    if (
      expectedSchema &&
      typeof expectedSchema === "object" &&
      !Array.isArray(expectedSchema)
    ) {
      const requiredKeys = Object.keys(expectedSchema as Record<string, unknown>);
      const missing = requiredKeys.filter((k) => !Object.prototype.hasOwnProperty.call(output, k));
      if (missing.length) {
        findings.push(
          buildFinding(
            criterion.id,
            "error",
            `Missing required keys: ${missing.join(", ")}`,
            "output"
          )
        );
        score -= 0.2 * missing.length;
      } else {
        score += 0.15;
      }
    }

    return {
      rawScore: score,
      notes: "Placeholder schema conformance heuristic",
      findings,
    };
  }
}
