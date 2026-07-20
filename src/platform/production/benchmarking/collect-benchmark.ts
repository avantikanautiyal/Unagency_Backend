/**
 * Benchmark extraction from integration + OpenAI artifacts.
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { BenchmarkResult } from "../contracts/metrics";
import type { OpenAIProviderPlatform } from "../../intelligence/providers/openai/factories/create-openai-provider";

export function collectBenchmark(
  report: IntelligenceOsIntegrationReport,
  openai: OpenAIProviderPlatform,
  nowIso: () => string
): BenchmarkResult {
  const runtime = report.artifacts.runtime;
  const stats = runtime?.statistics;
  const usage = (runtime?.response?.usage ?? {}) as Record<string, unknown>;
  const metrics = openai.dispatcher.getLastArtifacts?.()?.providerMetrics;

  const promptTokens =
    Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) ||
    Number(metrics?.inputTokens ?? 0);
  const completionTokens =
    Number(usage.completion_tokens ?? usage.output_tokens ?? 0) ||
    Number(metrics?.outputTokens ?? 0);
  const cost =
    Number(usage.cost ?? 0) || Number(metrics?.estimatedCost ?? 0);

  const evalScore = report.artifacts.evaluation?.report?.summary?.overallScore ?? 0;
  const disposition = report.artifacts.evaluation?.review?.disposition;
  const humanReview =
    disposition === "mandatory" ||
    disposition === "recommended" ||
    evalScore < 0.6;

  return {
    providerLatencyMs: stats?.executionMs ?? metrics?.latencyMs ?? stats?.totalMs ?? 0,
    executionLatencyMs: report.durationMs,
    promptTokens,
    completionTokens,
    cost,
    retryCount: stats?.retries ?? metrics?.retryCount ?? 0,
    streamingChunkCount: stats?.streamingChunks ?? 0,
    evaluationScore: evalScore,
    humanReviewRequired: humanReview,
    capturedAt: nowIso(),
  };
}
