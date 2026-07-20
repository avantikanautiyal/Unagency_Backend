/**
 * Experience Intelligence testing utilities.
 */

import { asCapabilityId, asProviderId } from "../../shared/identifiers";
import {
  makeEvaluationReport,
  makeLearningResult,
  makeObservabilityReport,
} from "../../execution-optimization/testing";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import { ExperienceIntelligenceRequestBuilder } from "../builders/experience-intelligence-request-builder";
import {
  createExperienceIntelligencePlatform,
  type ExperienceIntelligencePlatform,
  type CreateExperienceIntelligenceOptions,
} from "../factories/create-experience-intelligence-platform";
import type { ModelDecisionRecord } from "../../model-intelligence/contracts/decision-record";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function makeModelDecisionRecord(): ModelDecisionRecord {
  return {
    recordId: "mdr_1" as never,
    capabilityId: asCapabilityId("text.generate"),
    department: "marketing",
    candidateModels: [],
    rankingScores: {},
    rankingExplanation: "Best fit for creative tasks",
    winningModel: {
      modelId: "test-model",
      providerId: asProviderId("test-provider"),
      rank: 1,
      overallScore: 92,
      expectedCost: 0.002,
      expectedLatencyMs: 800,
      explanation: { summary: "Top ranked", whyRanked: "Quality and cost balance" },
    },
    fallbackModels: [],
    expectedCost: 0.002,
    expectedTokens: 1500,
    expectedLatencyMs: 800,
    expectedQuality: 0.9,
    expectedConfidence: 0.88,
    reasonForSelection: "Best quality-cost balance for marketing copy",
    policyDecisions: [],
    constraintDecisions: [],
    timestamp: "2026-01-01T00:00:00.000Z",
    version: "1.0.0",
  };
}

export function sampleHistoricalInputs(count = 100): ExperienceIntelligenceInputs {
  const evaluationReports = Array.from({ length: Math.min(count, 50) }, (_, i) =>
    makeEvaluationReport(i % 3 === 0 ? 0.55 : 0.85, i % 3 === 0 ? ["brand_alignment", "cta"] : [])
  );
  const observabilityReports = Array.from({ length: Math.min(count, 30) }, (_, i) =>
    makeObservabilityReport({
      providerId: `provider_${i % 5}`,
      capabilityId: asCapabilityId("text.generate"),
      successRate: i % 4 === 0 ? 0.7 : 0.96,
      qualityScore: i % 4 === 0 ? 0.65 : 0.9,
    })
  );
  const learningResults = [makeLearningResult(5)];
  return {
    evaluationReports,
    observabilityReports,
    learningResults,
    modelDecisionRecords: [makeModelDecisionRecord()],
  };
}

export function sampleExperienceIntelligenceRequest(batchSize = 100) {
  return ExperienceIntelligenceRequestBuilder.create()
    .withRequestId("exp_req_historical")
    .withInputs(sampleHistoricalInputs(batchSize))
    .withBatchSize(batchSize)
    .build();
}

export function setupExperienceIntelligencePlatform(
  options: CreateExperienceIntelligenceOptions = {}
): ExperienceIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createExperienceIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
