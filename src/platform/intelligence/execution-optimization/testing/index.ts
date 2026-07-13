/**
 * Execution Optimization testing utilities.
 */

import type { EvaluationReport } from "../../evaluation/contracts/evaluation-models";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { LearningResult } from "../../learning/contracts/learning-models";
import { asCapabilityId } from "../../shared/identifiers";
import {
  sampleExecutionIntelligenceRequest,
  setupExecutionIntelligencePlatform,
} from "../../execution-intelligence/testing";
import type { ExecutionOptimizationInputs } from "../contracts/inputs";
import type { ProviderObservabilityReport } from "../contracts/inputs";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import { ExecutionOptimizationRequestBuilder } from "../builders/execution-optimization-request-builder";
import {
  createExecutionOptimizationPlatform,
  type CreateExecutionOptimizationPlatformOptions,
  type ExecutionOptimizationPlatform,
} from "../factories/create-execution-optimization-platform";

export function makeObservabilityReport(
  overrides: Partial<ProviderObservabilityReport> & { providerId: string }
): ProviderObservabilityReport {
  return {
    reportId: overrides.reportId ?? `obs_${overrides.providerId}`,
    providerId: overrides.providerId,
    capabilityId: overrides.capabilityId,
    latencyMs: overrides.latencyMs ?? 1200,
    cost: overrides.cost ?? 0.002,
    successRate: overrides.successRate ?? 0.95,
    errorRate: overrides.errorRate ?? 0.05,
    qualityScore: overrides.qualityScore ?? 0.82,
    observedAt: overrides.observedAt ?? "2026-01-01T00:00:00.000Z",
    attributes: overrides.attributes,
  };
}

export function makeEvaluationReport(
  overallScore: number,
  failedCriteria: readonly string[] = []
): EvaluationReport {
  return {
    reportId: "eval_report_1",
    requestId: "eval_req_1",
    identity: {
      organizationId: "org_1" as never,
      workspaceId: "ws_1" as never,
      executionId: "exec_1" as never,
    },
    rubric: {
      id: "rubric_1",
      name: "default",
      version: "1.0.0",
      criteria: [],
      passingScore: 0.7,
    },
    judgeResults: [],
    summary: {
      overallScore,
      passingScore: 0.7,
      passed: overallScore >= 0.7,
      judgeCount: 1,
      passedJudgeCount: overallScore >= 0.7 ? 1 : 0,
      failedCriteria,
      highlights: [],
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function makeLearningResult(signalCount = 3): LearningResult {
  return {
    requestId: "learn_req_1",
    identity: {
      learningId: "learn_1",
      organizationId: "org_1" as never,
      workspaceId: "ws_1" as never,
    },
    signals: Array.from({ length: signalCount }, (_, i) => ({
      signalId: `sig_${i}`,
      kind: i % 2 === 0 ? ("routing" as const) : ("quality" as const),
      sourceArtifactId: `art_${i}`,
      sourceArtifactType: "execution" as const,
      value: 0.5 + i * 0.1,
      normalizedValue: 0.5 + i * 0.1,
      label: `signal_${i}`,
      extractedAt: "2026-01-01T00:00:00.000Z",
    })),
    patterns: [],
    statistics: {
      statisticsId: "stats_1",
      aggregates: [],
      trends: [],
      distributions: [],
      frequencies: [],
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    insights: [],
    recommendations: [],
    summary: {
      summaryId: "sum_1",
      signalCount,
      patternCount: 0,
      recommendationCount: 0,
      insightCount: 0,
      artifactCount: 0,
      highlights: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

export async function makeIntelligenceResult(
  strategy: "single_pass" | "reasoning_first" = "single_pass"
): Promise<ExecutionIntelligenceResult> {
  const { engine } = setupExecutionIntelligencePlatform();
  const request = await sampleExecutionIntelligenceRequest({ strategy });
  const result = await engine.optimize(request);
  if (!result.ok) throw result.error;
  return result.value;
}

export async function sampleExecutionOptimizationInputs(): Promise<ExecutionOptimizationInputs> {
  const intel = await makeIntelligenceResult("single_pass");
  return {
    evaluationReports: [makeEvaluationReport(0.62, ["brand_alignment"])],
    observabilityReports: [
      makeObservabilityReport({ providerId: "provider-1", latencyMs: 800, qualityScore: 0.88 }),
      makeObservabilityReport({ providerId: "provider-2", latencyMs: 2500, qualityScore: 0.7 }),
    ],
    learningResults: [makeLearningResult(4)],
    intelligenceResults: [intel],
    promptMetadata: [
      {
        templateId: "default.capability",
        templateVersion: "1.0.0",
        sectionCount: 2,
        constraintCount: 0,
        variableCount: 1,
      },
    ],
  };
}

export async function sampleExecutionOptimizationRequest(): Promise<ExecutionOptimizationRequest> {
  const inputs = await sampleExecutionOptimizationInputs();
  return ExecutionOptimizationRequestBuilder.create()
    .withRequestId("exec_opt_req_1")
    .withCapabilityId(asCapabilityId("echo"))
    .withInputs(inputs)
    .build();
}

export function deterministicHelpers() {
  let idCounter = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupExecutionOptimizationPlatform(
  options: CreateExecutionOptimizationPlatformOptions = {}
): ExecutionOptimizationPlatform {
  const helpers = deterministicHelpers();
  return createExecutionOptimizationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
