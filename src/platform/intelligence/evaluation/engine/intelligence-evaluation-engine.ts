/**
 * Intelligence Evaluation Engine.
 *
 * Purpose: Evaluate execution outputs objectively without AI execution.
 * Responsibilities: Judge pipeline → report → confidence → review decision.
 * Usage: evaluate(EvaluationRequest) → EvaluationResult
 * Future Extension: LLM judges, calibration profiles, learning feedback.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { EvaluationReportBuilder } from "../builders/evaluation-builders";
import { DefaultRubricResolver } from "../builders/rubric-resolver";
import type { EvaluationRequest, EvaluationResult } from "../contracts/evaluation-models";
import { EvaluationValidationError } from "../errors";
import type {
  IConfidenceEngine,
  IIntelligenceEvaluationEngine,
  IJudgePipeline,
  IReviewDecisionEngine,
  IRubricResolver,
  IScoreAggregator,
} from "../interfaces/evaluation-ports";
import {
  integrityForPlaceholderJudges,
  loadEvaluationIntegrityConfig,
} from "../integrity/evaluation-integrity";

export interface IntelligenceEvaluationEngineDependencies {
  readonly rubricResolver: IRubricResolver;
  readonly judgePipeline: IJudgePipeline;
  readonly scoreAggregator: IScoreAggregator;
  readonly reportBuilder: EvaluationReportBuilder;
  readonly confidenceEngine: IConfidenceEngine;
  readonly reviewDecisionEngine: IReviewDecisionEngine;
}

export class IntelligenceEvaluationEngine implements IIntelligenceEvaluationEngine {
  constructor(private readonly deps: IntelligenceEvaluationEngineDependencies) {}

  async evaluate(request: EvaluationRequest): Promise<Result<EvaluationResult>> {
    const config = loadEvaluationIntegrityConfig();
    if (!config.enabled) {
      return failure(new EvaluationValidationError("Evaluation is disabled"));
    }

    if (!request.identity.organizationId || !request.identity.workspaceId) {
      return failure(
        new EvaluationValidationError("organizationId and workspaceId are required")
      );
    }
    if (!request.executionResult) {
      return failure(new EvaluationValidationError("executionResult is required"));
    }

    const rubric = this.deps.rubricResolver.resolve(request);
    if (!rubric.ok) {
      return rubric;
    }

    const judgeResults = await this.deps.judgePipeline.evaluate({
      request,
      rubric: rubric.value,
    });
    if (!judgeResults.ok) {
      return judgeResults;
    }

    const summary = this.deps.scoreAggregator.aggregate(
      rubric.value,
      judgeResults.value
    );
    if (!summary.ok) {
      return summary;
    }

    const report = this.deps.reportBuilder.build(
      request,
      rubric.value,
      judgeResults.value,
      summary.value
    );

    const confidence = this.deps.confidenceEngine.assess(report, request);
    if (!confidence.ok) {
      return confidence;
    }

    const review = this.deps.reviewDecisionEngine.decide(report, confidence.value);
    if (!review.ok) {
      return review;
    }

    // Default wired judges are placeholder heuristics — display overallScore only.
    // Adaptive QUALITY feedback requires an explicit trusted evaluator override.
    const integrity =
      request.attributes?.integrityOverride &&
      typeof request.attributes.integrityOverride === "object"
        ? (request.attributes.integrityOverride as EvaluationResult["integrity"])
        : integrityForPlaceholderJudges({
            overallScore: summary.value.overallScore,
            confidenceScore: confidence.value.confidenceScore,
            rubricVersion: rubric.value.version,
          });

    return success({
      report,
      confidence: confidence.value,
      review: review.value,
      integrity,
    });
  }
}
