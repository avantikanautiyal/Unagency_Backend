import { createIntelligenceEvaluationEngine } from "../../../../src/platform/intelligence/evaluation/factories/create-evaluation-engine";
import { EvaluationReportBuilder, EvaluationRequestBuilder } from "../../../../src/platform/intelligence/evaluation/builders/evaluation-builders";
import { DefaultRubricResolver } from "../../../../src/platform/intelligence/evaluation/builders/rubric-resolver";
import { PlaceholderConfidenceEngine } from "../../../../src/platform/intelligence/evaluation/confidence/confidence-engine";
import { createDefaultJudgePipeline } from "../../../../src/platform/intelligence/evaluation/judges/judge-pipeline";
import { InstructionJudge } from "../../../../src/platform/intelligence/evaluation/judges/instruction-judge";
import { SafetyJudge } from "../../../../src/platform/intelligence/evaluation/judges/safety-judge";
import { PlaceholderReviewDecisionEngine } from "../../../../src/platform/intelligence/evaluation/review/review-decision-engine";
import { WeightedScoreAggregator } from "../../../../src/platform/intelligence/evaluation/scoring/weighted-aggregator";
import { DEFAULT_EVALUATION_RUBRIC } from "../../../../src/platform/intelligence/evaluation/rubrics/default-rubric";
import { summarizeReport, toEvaluationReportView } from "../../../../src/platform/intelligence/evaluation/reports/report-formatter";
import {
  failingExecutionResult,
  policyViolationExecutionResult,
  sampleEvaluationIdentity,
  sampleEvaluationRequest,
  sampleExecutionResult,
} from "../../../../src/platform/intelligence/evaluation/testing";

describe("IntelligenceEvaluationEngine", () => {
  it("produces evaluation, confidence, and review artifacts", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const result = await engine.evaluate(sampleEvaluationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.report.reportId).toMatch(/^ereport_/);
    expect(result.value.report.summary.judgeCount).toBeGreaterThan(0);
    expect(result.value.confidence.reportId).toMatch(/^conf_/);
    expect(result.value.review.decisionId).toMatch(/^review_/);
    expect(result.value.report.checksum).toBeTruthy();
  });

  it("fails validation without identity fields", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const request = sampleEvaluationRequest({
      identity: {
        ...sampleEvaluationIdentity(),
        organizationId: "" as never,
      },
    });

    const result = await engine.evaluate(request);
    expect(result.ok).toBe(false);
  });
});

describe("Judge pipeline", () => {
  it("runs instruction and safety judges", async () => {
    const pipeline = createDefaultJudgePipeline();
    const request = sampleEvaluationRequest();
    const context = { request, rubric: DEFAULT_EVALUATION_RUBRIC };
    const results = await pipeline.evaluate(context);

    expect(results.ok).toBe(true);
    if (!results.ok) return;

    const kinds = results.value.map((r) => r.kind);
    expect(kinds).toContain("instruction");
    expect(kinds).toContain("safety");
    expect(results.value.every((r) => r.evaluatedAt)).toBe(true);
  });

  it("flags unsafe output in safety judge", async () => {
    const judge = new SafetyJudge();
    const request = sampleEvaluationRequest({
      executionResult: failingExecutionResult(),
    });
    const result = await judge.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(false);
    expect(result.value.findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("scores instruction adherence for successful execution", async () => {
    const judge = new InstructionJudge();
    const request = sampleEvaluationRequest({
      executionResult: sampleExecutionResult(),
    });
    const result = await judge.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregateScore).toBeGreaterThan(0.5);
  });
});

describe("Scoring", () => {
  it("aggregates weighted scores across judges", async () => {
    const pipeline = createDefaultJudgePipeline();
    const aggregator = new WeightedScoreAggregator();
    const request = sampleEvaluationRequest();
    const judgeResults = await pipeline.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });
    expect(judgeResults.ok).toBe(true);
    if (!judgeResults.ok) return;

    const summary = aggregator.aggregate(
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;

    expect(summary.value.overallScore).toBeGreaterThan(0);
    expect(summary.value.overallScore).toBeLessThanOrEqual(1);
    expect(summary.value.judgeCount).toBe(judgeResults.value.length);
  });

  it("fails when required criteria fail", async () => {
    const pipeline = createDefaultJudgePipeline();
    const aggregator = new WeightedScoreAggregator();
    const request = sampleEvaluationRequest({
      executionResult: policyViolationExecutionResult(),
    });
    const judgeResults = await pipeline.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });
    expect(judgeResults.ok).toBe(true);
    if (!judgeResults.ok) return;

    const summary = aggregator.aggregate(
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.passed).toBe(false);
    expect(summary.value.failedCriteria.length).toBeGreaterThan(0);
  });
});

describe("Confidence", () => {
  it("separates confidence from quality score", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const result = await engine.evaluate(sampleEvaluationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.confidence.confidenceScore).toBeGreaterThan(0);
    expect(result.value.confidence.factors.length).toBeGreaterThan(0);
    expect(
      result.value.confidence.factors.some((f) => f.id === "factor_quality")
    ).toBe(true);
    expect(
      result.value.confidence.factors.some((f) => f.id === "factor_execution")
    ).toBe(true);
  });

  it("lowers confidence for failed execution", async () => {
    const confidenceEngine = new PlaceholderConfidenceEngine();
    const reportBuilder = new EvaluationReportBuilder();
    const pipeline = createDefaultJudgePipeline();
    const aggregator = new WeightedScoreAggregator();

    const request = sampleEvaluationRequest({
      executionResult: failingExecutionResult(),
    });
    const judgeResults = await pipeline.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });
    expect(judgeResults.ok).toBe(true);
    if (!judgeResults.ok) return;

    const summary = aggregator.aggregate(
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;

    const report = reportBuilder.build(
      request,
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value,
      summary.value
    );
    const confidence = confidenceEngine.assess(report, request);
    expect(confidence.ok).toBe(true);
    if (!confidence.ok) return;

    const successRequest = sampleEvaluationRequest();
    const successJudges = await pipeline.evaluate({
      request: successRequest,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });
    expect(successJudges.ok).toBe(true);
    if (!successJudges.ok) return;
    const successSummary = aggregator.aggregate(
      DEFAULT_EVALUATION_RUBRIC,
      successJudges.value
    );
    expect(successSummary.ok).toBe(true);
    if (!successSummary.ok) return;
    const successReport = reportBuilder.build(
      successRequest,
      DEFAULT_EVALUATION_RUBRIC,
      successJudges.value,
      successSummary.value
    );
    const successConfidence = confidenceEngine.assess(successReport, successRequest);
    expect(successConfidence.ok).toBe(true);
    if (!successConfidence.ok) return;

    expect(confidence.value.confidenceScore).toBeLessThan(
      successConfidence.value.confidenceScore
    );
  });
});

describe("Review decisions", () => {
  it("returns skip for passing evaluation", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const result = await engine.evaluate(sampleEvaluationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(["skip", "optional"]).toContain(result.value.review.disposition);
  });

  it("returns mandatory for safety failures", async () => {
    const reviewEngine = new PlaceholderReviewDecisionEngine();
    const reportBuilder = new EvaluationReportBuilder();
    const pipeline = createDefaultJudgePipeline();
    const aggregator = new WeightedScoreAggregator();
    const confidenceEngine = new PlaceholderConfidenceEngine();

    const request = sampleEvaluationRequest({
      executionResult: failingExecutionResult(),
    });
    const judgeResults = await pipeline.evaluate({
      request,
      rubric: DEFAULT_EVALUATION_RUBRIC,
    });
    expect(judgeResults.ok).toBe(true);
    if (!judgeResults.ok) return;

    const summary = aggregator.aggregate(
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;

    const report = reportBuilder.build(
      request,
      DEFAULT_EVALUATION_RUBRIC,
      judgeResults.value,
      summary.value
    );
    const confidence = confidenceEngine.assess(report, request);
    expect(confidence.ok).toBe(true);
    if (!confidence.ok) return;

    const review = reviewEngine.decide(report, confidence.value);
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.value.disposition).toBe("mandatory");
    expect(review.value.triggers).toContain("safety_judge_failed");
  });
});

describe("Reports", () => {
  it("builds immutable evaluation reports with checksum", () => {
    const builder = new EvaluationReportBuilder();
    const request = EvaluationRequestBuilder.create()
      .withIdentity(sampleEvaluationIdentity())
      .withExecutionResult(sampleExecutionResult())
      .build();

    const report = builder.build(request, DEFAULT_EVALUATION_RUBRIC, [], {
      overallScore: 0.8,
      passingScore: 0.7,
      passed: true,
      judgeCount: 0,
      passedJudgeCount: 0,
      failedCriteria: [],
      highlights: ["test"],
    });

    expect(report.reportId).toMatch(/^ereport_/);
    expect(report.checksum).toHaveLength(64);
  });

  it("formats report views", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const result = await engine.evaluate(sampleEvaluationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const view = toEvaluationReportView(result.value);
    expect(view.reportId).toBe(result.value.report.reportId);
    expect(view.judgeSummary.length).toBeGreaterThan(0);
    expect(summarizeReport(result.value.report)).toContain("Evaluation");
  });

  it("resolves default rubric", () => {
    const resolver = new DefaultRubricResolver();
    const request = sampleEvaluationRequest();
    const rubric = resolver.resolve(request);
    expect(rubric.ok).toBe(true);
    if (rubric.ok) {
      expect(rubric.value.id).toBe(DEFAULT_EVALUATION_RUBRIC.id);
    }
  });
});
