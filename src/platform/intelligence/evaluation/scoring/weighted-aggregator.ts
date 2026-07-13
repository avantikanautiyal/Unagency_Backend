/**
 * Weighted score aggregation across judge results.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  EvaluationRubric,
  EvaluationSummary,
  JudgeResult,
} from "../contracts/evaluation-models";
import { EvaluationValidationError } from "../errors";
import { clampScore } from "../judges/base-judge";
import type { IScoreAggregator } from "../interfaces/evaluation-ports";

export class WeightedScoreAggregator implements IScoreAggregator {
  aggregate(
    rubric: EvaluationRubric,
    judgeResults: readonly JudgeResult[]
  ): Result<EvaluationSummary> {
    if (!judgeResults.length) {
      return failure(new EvaluationValidationError("judge results are required"));
    }

    const allScores = judgeResults.flatMap((j) => j.scores);
    const totalWeight = allScores.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight <= 0) {
      return failure(new EvaluationValidationError("total criterion weight must be positive"));
    }

    const overallScore = clampScore(
      allScores.reduce((sum, s) => sum + s.weightedScore, 0) / totalWeight
    );

    const failedCriteria = allScores
      .filter((s) => !s.passed)
      .map((s) => s.criterionId);

    const requiredFailures = rubric.criteria
      .filter((c) => c.required)
      .filter((c) => failedCriteria.includes(c.id));

    const passedJudgeCount = judgeResults.filter((j) => j.passed).length;
    const passed =
      overallScore >= rubric.passingScore && requiredFailures.length === 0;

    const highlights: string[] = [];
    if (passed) {
      highlights.push("Overall evaluation passed");
    } else {
      highlights.push("Overall evaluation failed");
    }
    if (requiredFailures.length) {
      highlights.push(
        `Required criteria failed: ${requiredFailures.map((c) => c.name).join(", ")}`
      );
    }

    const topScores = [...allScores]
      .sort((a, b) => b.normalizedScore - a.normalizedScore)
      .slice(0, 2);
    for (const score of topScores) {
      highlights.push(`${score.criterionName}: ${score.normalizedScore.toFixed(2)}`);
    }

    return success({
      overallScore,
      passingScore: rubric.passingScore,
      passed,
      judgeCount: judgeResults.length,
      passedJudgeCount,
      failedCriteria,
      highlights,
    });
  }
}
