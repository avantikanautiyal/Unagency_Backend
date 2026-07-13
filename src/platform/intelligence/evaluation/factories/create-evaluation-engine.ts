/**
 * Factory for IntelligenceEvaluationEngine with default placeholder components.
 */

import { EvaluationReportBuilder } from "../builders/evaluation-builders";
import { DefaultRubricResolver } from "../builders/rubric-resolver";
import { PlaceholderConfidenceEngine } from "../confidence/confidence-engine";
import { IntelligenceEvaluationEngine } from "../engine/intelligence-evaluation-engine";
import { createDefaultJudgePipeline } from "../judges/judge-pipeline";
import type { IIntelligenceEvaluationEngine } from "../interfaces/evaluation-ports";
import { PlaceholderReviewDecisionEngine } from "../review/review-decision-engine";
import { WeightedScoreAggregator } from "../scoring/weighted-aggregator";

export function createIntelligenceEvaluationEngine(): IIntelligenceEvaluationEngine {
  return new IntelligenceEvaluationEngine({
    rubricResolver: new DefaultRubricResolver(),
    judgePipeline: createDefaultJudgePipeline(),
    scoreAggregator: new WeightedScoreAggregator(),
    reportBuilder: new EvaluationReportBuilder(),
    confidenceEngine: new PlaceholderConfidenceEngine(),
    reviewDecisionEngine: new PlaceholderReviewDecisionEngine(),
  });
}
