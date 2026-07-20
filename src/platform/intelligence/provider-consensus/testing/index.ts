/**
 * Provider Consensus testing utilities.
 */

import {
  asProviderId,
} from "../../shared/identifiers";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import type { ConsensusCandidate } from "../contracts/candidate";
import { ConsensusRequestBuilder } from "../builders/consensus-request-builder";
import {
  createProviderConsensusPlatform,
  type CreateProviderConsensusOptions,
  type ProviderConsensusPlatform,
} from "../factories/create-provider-consensus-platform";
import type { ConsensusRole } from "../contracts/enums";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 3),
  };
}

function makeExecution(
  providerId: string,
  content: string,
  opts: { success?: boolean; totalMs?: number } = {}
): ProviderExecutionResult {
  const success = opts.success ?? true;
  return {
    requestId: `req_${providerId}`,
    sessionId: `sess_${providerId}`,
    status: success ? "completed" : "failed",
    success,
    response: success
      ? {
          requestId: `req_${providerId}`,
          providerId: asProviderId(providerId),
          output: { content },
          usage: { prompt_tokens: 10, completion_tokens: 20 },
          streamed: false,
          finishedAt: "2026-01-01T00:00:00.000Z",
        }
      : undefined,
    error: success ? undefined : { code: "provider_error", message: "failed" },
    statistics: {
      queueWaitMs: 0,
      dispatchMs: 5,
      executionMs: opts.totalMs ?? 100,
      streamingMs: 0,
      totalMs: opts.totalMs ?? 100,
      attempts: 1,
      retries: 0,
      timeouts: 0,
      streamingChunks: 0,
    },
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function makeCandidate(
  providerId: string,
  content: string,
  overrides: Partial<ConsensusCandidate> & {
    quality?: number;
    cost?: number;
    latencyMs?: number;
    role?: ConsensusRole;
  } = {}
): ConsensusCandidate {
  const { quality, cost, latencyMs, role, ...rest } = overrides;
  return {
    candidateId: `cand_${providerId}`,
    providerId,
    modelId: `${providerId}-model`,
    role,
    weight: rest.weight ?? 1,
    execution: rest.execution ?? makeExecution(providerId, content, { totalMs: latencyMs }),
    observability: {
      qualityScore: quality ?? 0.8,
      cost: cost ?? 0.01,
      latencyMs: latencyMs ?? 120,
    },
    confidence: rest.confidence ?? {
      reportId: `conf_${providerId}`,
      evaluationReportId: `eval_${providerId}`,
      confidenceScore: quality ?? 0.8,
      confidenceLevel: "high",
      factors: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    artifactRefs: [`art_${providerId}`],
    ...rest,
  };
}

export function sampleThreeProviderCandidates(): ConsensusCandidate[] {
  return [
    makeCandidate("openai", "OpenAI draft: Launch sneakers with bold CTA.", {
      quality: 0.82,
      cost: 0.02,
      latencyMs: 200,
      role: "writing",
    }),
    makeCandidate("anthropic", "Claude draft: Premium sneaker narrative, formal tone.", {
      quality: 0.88,
      cost: 0.03,
      latencyMs: 250,
      role: "reviewer",
    }),
    makeCandidate("gemini", "Gemini research: Market prefers playful youth tone.", {
      quality: 0.75,
      cost: 0.01,
      latencyMs: 150,
      role: "research",
    }),
  ];
}

export function sampleConsensusRequest(
  strategy: import("../contracts/enums").ConsensusStrategyKind = "best_quality"
) {
  return ConsensusRequestBuilder.create()
    .withRequestId("consensus_req_1")
    .withCandidates(sampleThreeProviderCandidates())
    .withStrategy(strategy)
    .withMergeMode("none")
    .build();
}

export function setupProviderConsensusPlatform(
  options: CreateProviderConsensusOptions = {}
): ProviderConsensusPlatform {
  const helpers = deterministicHelpers();
  return createProviderConsensusPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
