/**
 * Evaluation report formatting utilities.
 */

import type { EvaluationReport, EvaluationResult } from "../contracts/evaluation-models";

export interface EvaluationReportView {
  readonly reportId: string;
  readonly passed: boolean;
  readonly overallScore: number;
  readonly confidenceScore: number;
  readonly reviewDisposition: string;
  readonly judgeSummary: readonly {
    readonly kind: string;
    readonly passed: boolean;
    readonly score: number;
  }[];
}

export function toEvaluationReportView(result: EvaluationResult): EvaluationReportView {
  return {
    reportId: result.report.reportId,
    passed: result.report.summary.passed,
    overallScore: result.report.summary.overallScore,
    confidenceScore: result.confidence.confidenceScore,
    reviewDisposition: result.review.disposition,
    judgeSummary: result.report.judgeResults.map((j) => ({
      kind: j.kind,
      passed: j.passed,
      score: j.aggregateScore,
    })),
  };
}

export function summarizeReport(report: EvaluationReport): string {
  const { summary } = report;
  return [
    `Evaluation ${summary.passed ? "PASSED" : "FAILED"}`,
    `Score: ${summary.overallScore.toFixed(2)} / ${summary.passingScore.toFixed(2)}`,
    `Judges: ${summary.passedJudgeCount}/${summary.judgeCount} passed`,
  ].join(" | ");
}
