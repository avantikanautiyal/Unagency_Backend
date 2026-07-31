/**
 * M9.5P — Multimodal evaluation & feedback integrity (offline).
 * External AI calls: 0
 */

import { createIntelligenceEvaluationEngine } from "../../../../src/platform/intelligence/evaluation/factories/create-evaluation-engine";
import {
  evaluateImageTechnical,
  evaluateVideoTechnical,
  evaluateAudioTechnical,
  evaluateEmbeddingContract,
  evaluateStructuredSchemaCompliance,
  evaluateSttBenchmark,
  evaluateTrustedFakeTextQuality,
  evaluateTrustedFakeImageQuality,
  isQualityFeedbackEligible,
  integrityForPlaceholderJudges,
  integrityTechnicalCompliance,
  loadEvaluationIntegrityConfig,
  buildUnevaluatedEvaluationResult,
} from "../../../../src/platform/intelligence/evaluation/integrity";
import { InMemoryModelPerformanceStore } from "../../../../src/platform/intelligence/providers/routing/performance/stores/in-memory-model-performance-store";
import { ModelPerformanceIntelligence } from "../../../../src/platform/intelligence/providers/routing/performance/intelligence/model-performance-intelligence";
import { loadProviderFailoverConfig, loadAdaptiveRoutingConfig } from "../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";
import { aggregatePerformanceEvidence } from "../../../../src/platform/intelligence/providers/routing/performance/aggregation/performance-aggregator";
import type { PerformanceEvidence } from "../../../../src/platform/intelligence/providers/routing/performance/contracts/performance-evidence";
import { EvaluationRequestBuilder, evaluationIdentityFromIds } from "../../../../src/platform/intelligence/evaluation/builders/evaluation-builders";
import { sampleExecutionResult } from "../../../../src/platform/intelligence/evaluation/testing";
import { buildExecutionIntelligenceSnapshot } from "../../../../src/platform/api/execution-intelligence/projection/build-snapshot";
import * as fs from "fs";
import * as path from "path";

function baseEvidence(overrides: Partial<PerformanceEvidence> = {}): PerformanceEvidence {
  const now = new Date().toISOString();
  return {
    evidenceId: `ev_${Math.random().toString(36).slice(2, 8)}`,
    executionId: "exec_1",
    attemptId: `att_${Math.random().toString(36).slice(2, 8)}`,
    organizationId: "org_a",
    capabilityId: "text.generate",
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    positionInRoute: 0,
    primaryOrFailover: "primary",
    startedAt: now,
    completedAt: now,
    latencyMs: 100,
    success: true,
    failureCategory: "none",
    retryCount: 0,
    timeoutOccurred: false,
    rateLimited: false,
    recordedAt: now,
    ...overrides,
  };
}

describe("M9.5P evaluation integrity", () => {
  it("A: trusted fake text quality is feedback-eligible", () => {
    const integrity = evaluateTrustedFakeTextQuality({
      text: "The campaign launched successfully in winter",
      expectedKeywords: ["campaign", "winter"],
    });
    expect(integrity.qualityScore).toBe(1);
    expect(integrity.feedbackEligible).toBe(true);
    expect(isQualityFeedbackEligible(integrity, "medium")).toBe(true);
  });

  it("B: placeholder judges leave quality null / not eligible", () => {
    const integrity = integrityForPlaceholderJudges({ overallScore: 0.92 });
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
    expect(integrity.exclusionReason).toBe("placeholder_heuristic_judges");
  });

  it("C: default evaluation engine marks integrity non-eligible", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const req = EvaluationRequestBuilder.create()
      .withIdentity(
        evaluationIdentityFromIds({
          organizationId: "org_1",
          workspaceId: "ws_1",
          executionId: "exec_p",
          capabilityId: "text.generate",
        })
      )
      .withExecutionResult(sampleExecutionResult({ output: { content: "hello world" } }))
      .build();
    const out = await engine.evaluate(req);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.integrity?.feedbackEligible).toBe(false);
    expect(out.value.integrity?.qualityScore).toBeNull();
    expect(out.value.report.summary.overallScore).toBeGreaterThan(0); // display only
  });

  it("D: structured schema compliance ≠ semantic quality", () => {
    const integrity = evaluateStructuredSchemaCompliance({ schemaValid: true });
    expect(integrity.dimensions.schemaCompliance).toBe(1);
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
    expect(integrity.metricNamespaces).toContain("COMPLIANCE");
  });

  it("E/F: tool operational success does not invent provider quality", () => {
    const integrity = integrityTechnicalCompliance({
      dimensions: { toolCorrectness: null, technicalValidity: 1 },
      judgeId: "tool_ops",
    });
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
  });

  it("G: image technical validation honest", () => {
    const integrity = evaluateImageTechnical(
      {
        organizationId: "org_a",
        ownerOrganizationId: "org_a",
        artifactId: "art_1",
        mimeType: "image/png",
        byteSize: 1200,
        width: 512,
        height: 512,
        nonEmpty: true,
      },
      "org_a"
    );
    expect(integrity.dimensions.technicalValidity).toBe(1);
    expect(integrity.dimensions.visualQuality).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
  });

  it("H: trusted fake image judge can be feedback-eligible", () => {
    const integrity = evaluateTrustedFakeImageQuality({
      promptAligned: true,
      visualAcceptable: true,
    });
    expect(integrity.qualityScore).toBe(1);
    expect(integrity.feedbackEligible).toBe(true);
  });

  it("I: video technical only", () => {
    const integrity = evaluateVideoTechnical(
      {
        organizationId: "org_a",
        ownerOrganizationId: "org_a",
        artifactId: "vid_1",
        mimeType: "video/mp4",
        byteSize: 9_000_000,
        durationSeconds: 5,
        nonEmpty: true,
      },
      "org_a",
      { minDurationSeconds: 1, maxDurationSeconds: 10 }
    );
    expect(integrity.dimensions.technicalValidity).toBe(1);
    expect(integrity.dimensions.visualQuality).toBeNull();
    expect(integrity.qualityScore).toBeNull();
  });

  it("J: TTS technical only", () => {
    const integrity = evaluateAudioTechnical(
      {
        organizationId: "org_a",
        ownerOrganizationId: "org_a",
        artifactId: "aud_1",
        mimeType: "audio/mpeg",
        byteSize: 40_000,
        durationSeconds: 2.5,
        nonEmpty: true,
      },
      "org_a"
    );
    expect(integrity.dimensions.technicalValidity).toBe(1);
    expect(integrity.dimensions.voiceNaturalness).toBeNull();
  });

  it("K: STT with reference → WER benchmark eligible", () => {
    const integrity = evaluateSttBenchmark({
      reference: "the quick brown fox",
      hypothesis: "the quick brown fox",
    });
    expect(integrity.qualityScore).toBe(1);
    expect(integrity.evaluationMethod).toBe("benchmark");
    expect(integrity.feedbackEligible).toBe(true);
  });

  it("L: STT without reference stays unsupported for quality", () => {
    // No reference → use not_supported path via empty reference
    const integrity = evaluateSttBenchmark({ reference: "", hypothesis: "hello" });
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
  });

  it("M: embedding contract ≠ embedding quality", () => {
    const integrity = evaluateEmbeddingContract({
      vectors: [[0.1, 0.2, 0.3]],
      expectedDimensions: 3,
      expectedBatchCount: 1,
    });
    expect(integrity.dimensions.technicalValidity).toBe(1);
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
  });

  it("N: cross-tenant media evaluation denied", () => {
    const integrity = evaluateImageTechnical(
      {
        organizationId: "org_b",
        ownerOrganizationId: "org_b",
        artifactId: "art_x",
        mimeType: "image/png",
        byteSize: 10,
        nonEmpty: true,
      },
      "org_a"
    );
    expect(integrity.evaluationStatus).toBe("not_supported");
    expect(integrity.exclusionReason).toBe("cross_tenant_media_denied");
  });

  it("O: recursion soft-skip result has null quality", () => {
    const result = buildUnevaluatedEvaluationResult({
      requestId: "req_rec",
      reason: "evaluation_recursion_blocked",
    });
    expect(result.integrity?.qualityScore).toBeNull();
    expect(result.integrity?.feedbackEligible).toBe(false);
  });

  it("P: cold start preserved without eligible quality", async () => {
    const store = new InMemoryModelPerformanceStore();
    const config = loadAdaptiveRoutingConfig({
      ...process.env,
      ADAPTIVE_ROUTING_ENABLED: "true",
      ADAPTIVE_ROUTING_MIN_SAMPLES: "5",
    });
    const intel = new ModelPerformanceIntelligence(store, config);
    const blend = await intel.blendScore({
      staticTotal: 0.7,
      staticQuality: 0.7,
      staticLatency: 0.6,
      staticCost: 0.5,
      staticHealth: 0.8,
      strategy: "balanced",
      key: {
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        organizationId: "org_a",
      },
    });
    expect(blend.explain.coldStart).toBe(true);
    expect(blend.quality).toBe(0.7);
  });

  it("Q: only feedbackEligible quality feeds aggregate", async () => {
    const store = new InMemoryModelPerformanceStore();
    const now = new Date().toISOString();
    // Technical compliance — must NOT affect quality mean
    await store.record(
      baseEvidence({
        attemptId: "a1",
        evaluationScore: 1,
        feedbackEligible: false,
        evaluationMethod: "deterministic",
        evaluationTrust: "high",
        completedAt: now,
      })
    );
    // Trusted quality
    await store.record(
      baseEvidence({
        attemptId: "a2",
        evaluationScore: 0.4,
        feedbackEligible: true,
        evaluationMethod: "heuristic",
        evaluationTrust: "medium",
        completedAt: now,
      })
    );
    const rows = await store.query({
      organizationId: "org_a",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
    });
    const metrics = aggregatePerformanceEvidence(
      rows,
      {
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        organizationId: "org_a",
      },
      { windowDays: 30 }
    );
    expect(metrics?.evaluationMean).toBeCloseTo(0.4, 5);
  });

  it("R: stub/placeholder attach does not persist routing quality score", async () => {
    const store = new InMemoryModelPerformanceStore();
    const ev = baseEvidence({ attemptId: "att_stub" });
    await store.record(ev);
    await store.attachEvaluation("att_stub", null, { formatCompliance: 1 }, {
      feedbackEligible: false,
      evaluationTrust: "low",
      evaluationMethod: "heuristic",
      evaluationStatus: "evaluated",
      evaluationExclusionReason: "placeholder_heuristic_judges",
    });
    const got = await store.getByAttemptId("att_stub");
    expect(got?.evaluationScore).toBeUndefined();
    expect(got?.feedbackEligible).toBe(false);
  });

  it("trusted attach persists quality score for adaptive routing", async () => {
    const store = new InMemoryModelPerformanceStore();
    await store.record(baseEvidence({ attemptId: "att_ok" }));
    await store.attachEvaluation("att_ok", 0.91, { relevance: 0.91 }, {
      feedbackEligible: true,
      evaluationTrust: "medium",
      evaluationMethod: "heuristic",
      evaluationStatus: "evaluated",
      judgeId: "trusted_fake_text_judge",
      judgeVersion: "m95p-cert-1",
    });
    const got = await store.getByAttemptId("att_ok");
    expect(got?.evaluationScore).toBe(0.91);
    expect(got?.feedbackEligible).toBe(true);
    expect(got?.judgeId).toBe("trusted_fake_text_judge");
  });

  it("EI snapshot does not invent evaluationScore", () => {
    const snap = buildExecutionIntelligenceSnapshot({
      execution: {
        executionId: "exec_ei",
        status: "succeeded",
        organizationId: "org_a",
        correlationId: "c1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        promptPreview: "hi",
      },
      nowIso: () => new Date().toISOString(),
    });
    expect(snap.quality.evaluationScore).toBeNull();
    expect(snap.quality.reviewRequired).toBe(false);
  });

  it("config loads credential-free", () => {
    const cfg = loadEvaluationIntegrityConfig({});
    expect(cfg.enabled).toBe(true);
    expect(cfg.feedbackMinTrust).toBe("medium");
    expect(cfg.maxDepth).toBe(1);
  });

  it("failover config still loads (regression smoke)", () => {
    const f = loadProviderFailoverConfig({});
    expect(f.failoverEnabled).toBe(true);
  });
});

describe("M9.5P provider bypass — evaluation paths", () => {
  it("evaluation module has no direct provider SDK imports", () => {
    const repoRoot = path.resolve(__dirname, "../../../../");
    const target = path.join(repoRoot, "src/platform/intelligence/evaluation");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(full, "utf8");
          if (
            content.includes('from "openai"') ||
            content.includes("from 'openai'") ||
            /api\.openai\.com/.test(content) ||
            /api\.anthropic\.com/.test(content)
          ) {
            offenders.push(path.relative(repoRoot, full));
          }
        }
      }
    };
    walk(target);
    expect(offenders).toEqual([]);
  });
});
