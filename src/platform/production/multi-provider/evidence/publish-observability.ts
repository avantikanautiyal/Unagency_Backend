/**
 * Publish benchmark evidence into Observability (additive; no OS redesign).
 */

import type { IObservabilityEngine } from "../../../infrastructure/observability/interfaces/observability";
import type { ObservabilityEvent } from "../../../infrastructure/observability/contracts";
import type { BenchmarkExecutionEvidence } from "../contracts";
import type { Result } from "../../../intelligence/shared/result";

export function evidenceToObservabilityEvents(
  evidence: readonly BenchmarkExecutionEvidence[],
  createEventId: (prefix: string) => string
): ObservabilityEvent[] {
  return evidence.map((e) => ({
    eventId: createEventId("mpev"),
    surface: "provider" as const,
    at: e.capturedAt,
    context: {
      correlationId: e.correlationId,
      traceId: e.correlationId,
      capabilityId: e.capabilityId,
      providerId: e.providerId,
      modelId: e.modelId,
      executionId: e.evidenceId,
    },
    span: {
      name: `multi_provider.${e.capabilityId}`,
      surface: "provider" as const,
      status: e.success ? ("ok" as const) : ("error" as const),
      startedAt: e.capturedAt,
      completedAt: e.capturedAt,
      durationMs: e.latencyMs,
    },
    metrics: [
      { name: "provider.latency_ms", value: e.latencyMs, unit: "ms" },
      { name: "provider.cost", value: e.cost, unit: "usd" },
      { name: "provider.retries", value: e.retryCount, unit: "count" },
      { name: "provider.streaming_chunks", value: e.streamingChunkCount, unit: "count" },
      { name: "evaluation.score", value: e.evaluationScore, unit: "score" },
    ],
    tokens: {
      promptTokens: e.promptTokens,
      completionTokens: e.completionTokens,
      cachedTokens: 0,
      streamingTokens: e.streamingChunkCount,
      toolTokens: 0,
      visionTokens: 0,
      audioTokens: 0,
      totalTokens: e.totalTokens,
    },
    cost: {
      amount: e.cost,
      currency: e.currency,
      providerId: e.providerId,
      modelId: e.modelId,
      capabilityId: e.capabilityId,
    },
    log: {
      level: e.success ? ("info" as const) : ("warn" as const),
      message: `Benchmark evidence ${e.providerId}/${e.modelId} for ${e.capabilityId}`,
    },
  }));
}

export function publishEvidenceToObservability(
  engine: IObservabilityEngine,
  evidence: readonly BenchmarkExecutionEvidence[],
  createEventId: (prefix: string) => string
): Result<{ accepted: number }> {
  return engine.ingestMany(evidenceToObservabilityEvents(evidence, createEventId));
}
