/**
 * Build complete benchmark-ready evidence from catalog provider resolution.
 * Does not redesign Evaluation / Learning — only publishes complete fields.
 */

import type { IntegratedProviderRecord } from "../../../intelligence/provider-catalog/integration/catalog-integration-engine";
import type { BenchmarkExecutionEvidence } from "../contracts";

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic simulated metrics from provider/model ids (stable for tests). */
export function simulateProviderMetrics(
  providerId: string,
  modelId: string
): {
  latencyMs: number;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  evaluationScore: number;
  retryCount: number;
  streamingChunkCount: number;
  streamingDurationMs: number;
} {
  const seed = hashSeed(`${providerId}:${modelId}`);
  const latencyMs = 80 + (seed % 400);
  const promptTokens = 100 + (seed % 500);
  const completionTokens = 50 + (seed % 300);
  const cost = Number(((latencyMs / 10000) + (promptTokens + completionTokens) / 1_000_000).toFixed(6));
  const evaluationScore = Number((0.65 + (seed % 30) / 100).toFixed(3));
  const retryCount = seed % 5 === 0 ? 1 : 0;
  const streamingChunkCount = 3 + (seed % 12);
  const streamingDurationMs = Math.floor(latencyMs * 0.4);
  return {
    latencyMs,
    cost,
    promptTokens,
    completionTokens,
    evaluationScore,
    retryCount,
    streamingChunkCount,
    streamingDurationMs,
  };
}

export function buildEvidenceForIntegratedProvider(
  rec: IntegratedProviderRecord,
  opts: {
    createId: (prefix: string) => string;
    nowIso: () => string;
    correlationPrefix: string;
  }
): BenchmarkExecutionEvidence[] {
  const evidence: BenchmarkExecutionEvidence[] = [];
  const models = rec.platform.getBootstrapModels();
  const caps = rec.platform.manifest.capabilityMatrix;

  for (const cap of caps) {
    const resolved = rec.platform.resolveModel({
      capabilityId: cap.capabilityId,
      requireReasoning: rec.entry.department === "llm",
    });
    const modelId = resolved.ok
      ? resolved.value.selectedModelId
      : models[0]?.id ?? `${rec.entry.providerId}:default`;

    const metrics = simulateProviderMetrics(rec.entry.providerId, modelId);
    const success = rec.certified && rec.platform.getStatus() === "active";

    evidence.push({
      evidenceId: opts.createId("ev"),
      correlationId: `${opts.correlationPrefix}_${rec.entry.providerId}_${cap.capabilityId}`,
      capabilityId: cap.capabilityId,
      providerId: rec.entry.providerId,
      modelId,
      latencyMs: metrics.latencyMs,
      cost: metrics.cost,
      currency: "USD",
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      totalTokens: metrics.promptTokens + metrics.completionTokens,
      evaluationScore: metrics.evaluationScore,
      humanReviewRequired: metrics.evaluationScore < 0.7,
      success,
      retryCount: metrics.retryCount,
      streamingChunkCount: metrics.streamingChunkCount,
      streamingDurationMs: metrics.streamingDurationMs,
      capturedAt: opts.nowIso(),
      source: "catalog_simulated",
      attributes: {
        department: rec.entry.department,
        certified: rec.certified,
        viaGenerator: true,
        usedExistingOpenAILeaf: rec.usedExistingOpenAILeaf,
        generationPackageRoot: rec.generationPackage.packageRoot,
      },
    });
  }

  return evidence;
}

export function buildComparisons(
  evidence: readonly BenchmarkExecutionEvidence[]
): import("../contracts").CrossProviderCapabilityComparison[] {
  const byCap = new Map<string, BenchmarkExecutionEvidence[]>();
  for (const e of evidence) {
    const list = byCap.get(e.capabilityId) ?? [];
    list.push(e);
    byCap.set(e.capabilityId, list);
  }

  return [...byCap.entries()].map(([capabilityId, rows]) => {
    const providers = rows.map((e) => ({
      providerId: e.providerId,
      modelId: e.modelId,
      evidenceId: e.evidenceId,
      latencyMs: e.latencyMs,
      cost: e.cost,
      evaluationScore: e.evaluationScore,
      success: e.success,
    }));
    const multi = new Set(providers.map((p) => p.providerId)).size >= 2;
    return {
      capabilityId,
      providers,
      routingChoiceEligible: multi,
      consensusEligible: multi,
      evaluationComparable: multi,
      learningComparable: multi,
    };
  });
}
