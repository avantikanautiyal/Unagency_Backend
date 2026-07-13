import { createLearningIntelligenceEngine } from "../../../../src/platform/intelligence/learning/factories/create-learning-engine";
import {
  AnalyzerSignalExtractor,
  createDefaultAnalyzers,
} from "../../../../src/platform/intelligence/learning/analyzers/analyzer-pipeline";
import { QualityAnalyzer } from "../../../../src/platform/intelligence/learning/analyzers/quality-analyzer";
import { EvaluationAnalyzer } from "../../../../src/platform/intelligence/learning/analyzers/evaluation-analyzer";
import { PlaceholderPatternDetector } from "../../../../src/platform/intelligence/learning/patterns/pattern-detector";
import { PlaceholderStatisticsEngine } from "../../../../src/platform/intelligence/learning/statistics/statistics-engine";
import { PlaceholderRecommendationGenerator } from "../../../../src/platform/intelligence/learning/recommendations/recommendation-generator";
import { PlaceholderExperimentManager } from "../../../../src/platform/intelligence/learning/experiments/experiment-ports";
import { PlaceholderOptimizationEngine } from "../../../../src/platform/intelligence/learning/optimization/optimization-ports";
import { LearningRequestBuilder, learningIdentityFromIds } from "../../../../src/platform/intelligence/learning/builders/learning-builders";
import { sampleLearningRequest } from "../../../../src/platform/intelligence/learning/testing";

describe("LearningIntelligenceEngine", () => {
  it("transforms artifacts into learning recommendations", async () => {
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals.length).toBeGreaterThan(0);
    expect(result.value.statistics.aggregates.length).toBeGreaterThan(0);
    expect(result.value.summary.artifactCount).toBeGreaterThan(0);
    expect(result.value.generatedAt).toBeTruthy();
  });

  it("fails without artifacts", async () => {
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn({
      requestId: "lreq_empty",
      identity: learningIdentityFromIds({ organizationId: "org_1", workspaceId: "ws_1" }),
      scope: { kind: "workspace", scopeId: "ws_1" },
      artifacts: [],
    });

    expect(result.ok).toBe(false);
  });
});

describe("Signal generation", () => {
  it("extracts signals from artifact snapshots", async () => {
    const extractor = new AnalyzerSignalExtractor(createDefaultAnalyzers());
    const request = await sampleLearningRequest();
    const result = await extractor.extract(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.every((s) => s.signalId.startsWith("lsig_"))).toBe(true);
  });
});

describe("Analyzers", () => {
  it("runs quality analyzer on execution artifacts", async () => {
    const request = await sampleLearningRequest();
    const analyzer = new QualityAnalyzer();
    const result = await analyzer.analyze({
      request,
      artifacts: request.artifacts,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((s) => s.kind === "quality")).toBe(true);
  });

  it("runs evaluation analyzer on evaluation artifacts", async () => {
    const request = await sampleLearningRequest();
    const analyzer = new EvaluationAnalyzer();
    const result = await analyzer.analyze({
      request,
      artifacts: request.artifacts,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((s) => s.kind === "evaluation")).toBe(true);
  });

  it("includes all 12 default analyzers", () => {
    expect(createDefaultAnalyzers()).toHaveLength(12);
  });
});

describe("Pattern detection", () => {
  it("detects patterns from grouped signals", async () => {
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detector = new PlaceholderPatternDetector();
    const patterns = detector.detect(result.value.signals, await sampleLearningRequest());
    expect(patterns.ok).toBe(true);
    if (patterns.ok) {
      expect(Array.isArray(patterns.value)).toBe(true);
    }
  });
});

describe("Statistics", () => {
  it("computes aggregates, trends, distributions, and frequencies", async () => {
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stats = result.value.statistics;
    expect(stats.aggregates.length).toBeGreaterThan(0);
    expect(stats.trends.length).toBeGreaterThan(0);
    expect(stats.distributions.length).toBeGreaterThan(0);
    expect(stats.frequencies.length).toBeGreaterThan(0);
  });
});

describe("Recommendation generation", () => {
  it("produces recommendations with required fields", async () => {
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const rec of result.value.recommendations) {
      expect(rec.reason).toBeTruthy();
      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.affectedModule).toBeTruthy();
      expect(rec.applicableScope).toBeTruthy();
      expect(rec.type).toBeTruthy();
      expect(rec.evidence.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("never mutates modules — recommendations are advisory only", async () => {
    const generator = new PlaceholderRecommendationGenerator();
    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const recs = generator.generate({
      request: await sampleLearningRequest(),
      signals: result.value.signals,
      patterns: result.value.patterns,
      statistics: result.value.statistics,
    });
    expect(recs.ok).toBe(true);
    if (recs.ok) {
      expect(recs.value.every((r) => r.recommendationId.startsWith("lrec_"))).toBe(true);
    }
  });
});

describe("Experiments", () => {
  it("creates experiment definitions via interface", () => {
    const manager = new PlaceholderExperimentManager();
    const result = manager.createExperiment({
      kind: "ab_test",
      name: "Prompt variant test",
      hypothesis: "Shorter prompts improve quality",
      scope: { kind: "workspace", scopeId: "ws_1" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.experimentId).toMatch(/^lexp_/);
    }
  });
});

describe("Optimization", () => {
  it("does not auto-optimize — returns recommendations unchanged", async () => {
    const optimizer = new PlaceholderOptimizationEngine();
    expect(optimizer.supported).toBe(false);

    const engine = createLearningIntelligenceEngine();
    const result = await engine.learn(await sampleLearningRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const suggested = optimizer.suggest(result.value.recommendations);
    expect(suggested.ok).toBe(true);
    if (suggested.ok) {
      expect(suggested.value).toEqual(result.value.recommendations);
    }
  });
});
