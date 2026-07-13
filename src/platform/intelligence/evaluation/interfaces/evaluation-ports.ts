/**
 * Intelligence Evaluation Platform ports.
 *
 * Purpose: Evaluate execution outputs objectively without AI execution.
 * Responsibilities: Judge pipeline, scoring, confidence, review decisions.
 * Usage: Injected into IntelligenceEvaluationEngine.
 * Future Extension: LLM judges, calibration, learning feedback loops.
 */

import type { Result } from "../../shared/result";
import type {
  ConfidenceReport,
  EvaluationReport,
  EvaluationRequest,
  EvaluationResult,
  EvaluationRubric,
  JudgeKind,
  JudgeResult,
  ReviewDecision,
} from "../contracts/evaluation-models";

export interface JudgeContext {
  readonly request: EvaluationRequest;
  readonly rubric: EvaluationRubric;
}

export interface IJudge {
  readonly kind: JudgeKind;
  readonly judgeId: string;
  evaluate(context: JudgeContext): Promise<Result<JudgeResult>>;
}

export interface IJudgePipeline {
  evaluate(context: JudgeContext): Promise<Result<readonly JudgeResult[]>>;
}

export interface IScoreAggregator {
  aggregate(
    rubric: EvaluationRubric,
    judgeResults: readonly JudgeResult[]
  ): Result<EvaluationReport["summary"]>;
}

export interface IConfidenceEngine {
  assess(
    report: EvaluationReport,
    request: EvaluationRequest
  ): Result<ConfidenceReport>;
}

export interface IReviewDecisionEngine {
  decide(
    report: EvaluationReport,
    confidence: ConfidenceReport
  ): Result<ReviewDecision>;
}

export interface IRubricResolver {
  resolve(request: EvaluationRequest): Result<EvaluationRubric>;
}

export interface IEvaluationReportBuilder {
  build(
    request: EvaluationRequest,
    rubric: EvaluationRubric,
    judgeResults: readonly JudgeResult[],
    summary: EvaluationReport["summary"]
  ): EvaluationReport;
}

export interface IIntelligenceEvaluationEngine {
  evaluate(request: EvaluationRequest): Promise<Result<EvaluationResult>>;
}
