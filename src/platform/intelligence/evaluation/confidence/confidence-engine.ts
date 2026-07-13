/**
 * Confidence engine — separates confidence from quality scoring.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ConfidenceFactor,
  ConfidenceLevel,
  ConfidenceReport,
  EvaluationReport,
} from "../contracts/evaluation-models";
import type { EvaluationRequest } from "../contracts/evaluation-models";
import { clampScore } from "../judges/base-judge";
import type { IConfidenceEngine } from "../interfaces/evaluation-ports";

function resolveConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return "very_high";
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export class PlaceholderConfidenceEngine implements IConfidenceEngine {
  assess(
    report: EvaluationReport,
    request: EvaluationRequest
  ): Result<ConfidenceReport> {
    const factors: ConfidenceFactor[] = [];

    const qualityFactor: ConfidenceFactor = {
      id: "factor_quality",
      name: "Evaluation Quality Signal",
      weight: 0.35,
      score: report.summary.overallScore,
      contribution: 0,
      rationale: "Derived from aggregated judge quality score",
    };
    factors.push(qualityFactor);

    const consistencyFactor: ConfidenceFactor = {
      id: "factor_consistency",
      name: "Judge Consistency",
      weight: 0.25,
      score: report.judgeResults.length
        ? report.summary.passedJudgeCount / report.judgeResults.length
        : 0,
      contribution: 0,
      rationale: "Ratio of judges that passed their criteria",
    };
    factors.push(consistencyFactor);

    const executionFactor: ConfidenceFactor = {
      id: "factor_execution",
      name: "Execution Success",
      weight: 0.2,
      score: request.executionResult.success ? 1 : 0.3,
      contribution: 0,
      rationale: "Execution success contributes to confidence, not quality",
    };
    factors.push(executionFactor);

    const evidenceFactor: ConfidenceFactor = {
      id: "factor_evidence",
      name: "Evidence Availability",
      weight: 0.2,
      score: request.memorySnapshot?.records?.length
        ? Math.min(1, request.memorySnapshot.records.length / 5)
        : 0.4,
      contribution: 0,
      rationale: "Memory artifacts increase confidence in evaluation context",
    };
    factors.push(evidenceFactor);

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    let confidenceScore = 0;
    const resolvedFactors: ConfidenceFactor[] = factors.map((factor) => {
      const contribution = (factor.score * factor.weight) / totalWeight;
      confidenceScore += contribution;
      return { ...factor, contribution };
    });
    confidenceScore = clampScore(confidenceScore);

    const confidenceReport: ConfidenceReport = {
      reportId: `conf_${randomUUID()}`,
      evaluationReportId: report.reportId,
      confidenceScore,
      confidenceLevel: resolveConfidenceLevel(confidenceScore),
      factors: resolvedFactors,
      generatedAt: new Date().toISOString(),
    };

    return success(confidenceReport);
  }
}
