/**
 * Review decision engine — produces disposition without human review.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ConfidenceReport,
  EvaluationReport,
  ReviewDecision,
  ReviewDisposition,
} from "../contracts/evaluation-models";
import type { IReviewDecisionEngine } from "../interfaces/evaluation-ports";

export class PlaceholderReviewDecisionEngine implements IReviewDecisionEngine {
  decide(
    report: EvaluationReport,
    confidence: ConfidenceReport
  ): Result<ReviewDecision> {
    const triggers: string[] = [];
    let disposition: ReviewDisposition = "skip";

    if (!report.summary.passed) {
      triggers.push("evaluation_failed");
      disposition = "mandatory";
    }

    const safetyJudge = report.judgeResults.find((j) => j.kind === "safety");
    if (safetyJudge && !safetyJudge.passed) {
      triggers.push("safety_judge_failed");
      disposition = "mandatory";
    }

    const policyJudge = report.judgeResults.find((j) => j.kind === "policy");
    if (policyJudge && !policyJudge.passed) {
      triggers.push("policy_judge_failed");
      disposition = "mandatory";
    }

    const humanJudge = report.judgeResults.find((j) => j.kind === "human");
    if (humanJudge && humanJudge.aggregateScore < 0.4) {
      triggers.push("human_review_signal");
      if (disposition !== "mandatory") {
        disposition = "recommended";
      }
    }

    if (confidence.confidenceLevel === "low") {
      triggers.push("low_confidence");
      if (disposition === "skip") {
        disposition = "recommended";
      }
    }

    if (
      disposition === "skip" &&
      report.summary.overallScore < report.summary.passingScore + 0.05
    ) {
      triggers.push("borderline_quality");
      disposition = "optional";
    }

    const rationale = buildRationale(disposition, triggers);

    return success({
      decisionId: `review_${randomUUID()}`,
      evaluationReportId: report.reportId,
      confidenceReportId: confidence.reportId,
      disposition,
      rationale,
      triggers,
      decidedAt: new Date().toISOString(),
    });
  }
}

function buildRationale(
  disposition: ReviewDisposition,
  triggers: readonly string[]
): string {
  const triggerText = triggers.length ? triggers.join(", ") : "none";
  switch (disposition) {
    case "mandatory":
      return `Human review is mandatory due to: ${triggerText}`;
    case "recommended":
      return `Human review is recommended due to: ${triggerText}`;
    case "optional":
      return `Human review is optional; borderline signals: ${triggerText}`;
    case "skip":
      return "No human review required based on evaluation and confidence signals";
  }
}
