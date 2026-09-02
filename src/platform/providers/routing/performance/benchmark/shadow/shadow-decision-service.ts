/**
 * Step 10 — Shadow decision service (read-only; never dispatches providers).
 */

import { loadAdaptiveRoutingConfig } from "../../config/adaptive-routing-config";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { createExperimentAnalysisService } from "../experiment/analysis/experiment-analysis-service";
import { filterControlledComparisonRecords } from "../evidence/evidence-validity";
import { resolveEvidenceTier } from "../evidence/evidence-collection-config";
import type {
  ShadowDecision,
  ShadowDecisionContext,
  ShadowCandidateRef,
} from "./shadow-decision-contract";
import {
  buildDefaultShadowCandidatePool,
  sameShadowCandidate,
} from "./shadow-candidate-catalog";
import { assessPromotionReadiness } from "./promotion-readiness";
import { loadPromotionReadinessThresholds } from "./shadow-config";
import {
  logShadowComparison,
  logShadowDecision,
  logShadowSafetyGate,
} from "./shadow-logger";

export type ShadowDecisionServiceDeps = {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
  readonly env?: NodeJS.ProcessEnv;
};

function candidateLabel(c: ShadowCandidateRef): string {
  return `${c.providerId}/${c.modelId} + ${c.strategyId} + ${c.knowledgeId ?? c.knowledgeVersion ?? "unknown"}`;
}

function implicationFromFingerprints(
  actualFp: Awaited<
    ReturnType<
      ReturnType<typeof createExperimentAnalysisService>["combinationPerformance"]
    >
  >,
  recFp: Awaited<
    ReturnType<
      ReturnType<typeof createExperimentAnalysisService>["combinationPerformance"]
    >
  >,
): {
  latency?: string;
  cost?: string;
  reliability?: string;
} {
  if (!actualFp || !recFp) return {};
  const latencyDelta = recFp.latencyMsMean - actualFp.latencyMsMean;
  const costDelta =
    actualFp.costMean != null && recFp.costMean != null
      ? recFp.costMean - actualFp.costMean
      : undefined;
  return Object.freeze({
    latency:
      Number.isFinite(latencyDelta) && latencyDelta !== 0
        ? `Historical latency delta: ${latencyDelta >= 0 ? "+" : ""}${latencyDelta.toFixed(0)}ms under comparable conditions`
        : undefined,
    cost:
      costDelta != null && Number.isFinite(costDelta)
        ? `Historical cost delta: ${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(4)} under comparable conditions`
        : undefined,
    reliability:
      recFp.operationalFailureRate > actualFp.operationalFailureRate
        ? `Historical operational failure rate higher for recommended candidate (${(recFp.operationalFailureRate * 100).toFixed(1)}% vs ${(actualFp.operationalFailureRate * 100).toFixed(1)}%)`
        : undefined,
  });
}

/**
 * Calculate shadow recommendation from Step 8/9 intelligence.
 * NEVER dispatches a provider or modifies production routing.
 */
export async function resolveShadowDecision(
  context: ShadowDecisionContext,
  deps?: ShadowDecisionServiceDeps,
): Promise<ShadowDecision> {
  const env = deps?.env ?? process.env;
  const routing = loadAdaptiveRoutingConfig(env);
  logShadowSafetyGate(routing.adaptiveRoutingEnabled);

  if (routing.adaptiveRoutingEnabled) {
    console.log(
      "[UNAGENCY-SHADOW] adaptive routing enabled — shadow layer remains observational only",
    );
  }

  const createId = deps?.createId ?? ((p: string) => `${p}_${context.productionExecutionId}`);
  const nowIso = deps?.nowIso ?? (() => new Date().toISOString());
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const analysis = createExperimentAnalysisService({ recordStore: store });

  const scope = [
    context.service,
    context.subtype,
    context.industry ?? "generic",
  ].join(" / ");

  const pool =
    context.candidatePool ??
    buildDefaultShadowCandidatePool({
      providerIds: [context.actual.providerId, "provider.openai", "provider.anthropic"],
      modelIds: [context.actual.modelId, "openai/gpt-4o", "anthropic/claude-sonnet-4-5"],
    });

  const recommendation = await analysis.recommendBestCombination({
    service: context.service,
    industry: context.industry,
    organizationId: context.organizationId,
    candidates: pool.map((c) =>
      Object.freeze({
        providerId: c.providerId,
        modelId: c.modelId,
        strategyId: c.strategyId,
        knowledgeId: c.knowledgeId ?? c.knowledgeVersion ?? "unknown",
        label: candidateLabel(c),
      }),
    ),
  });

  const recommendedFromRec = recommendation.candidate;
  const recommended: ShadowCandidateRef | undefined =
    recommendation.recommendationStatus === "RECOMMENDATION"
      ? Object.freeze({
          providerId: String(recommendedFromRec.providerId ?? ""),
          modelId: String(recommendedFromRec.modelId ?? ""),
          strategyId: String(recommendedFromRec.strategyId ?? ""),
          knowledgeId: recommendedFromRec.knowledgeId
            ? String(recommendedFromRec.knowledgeId)
            : undefined,
        })
      : undefined;

  let status: ShadowDecision["status"] = "INSUFFICIENT_EVIDENCE";
  let recommendationReason =
    "Insufficient controlled comparison evidence for a shadow recommendation.";

  if (recommendation.comparisonCompatibility === "INCOMPARABLE") {
    status = "INCOMPARABLE";
    recommendationReason = "Controlled evidence is incomparable across candidates.";
  } else if (recommendation.recommendationStatus === "INSUFFICIENT_EVIDENCE") {
    status = "INSUFFICIENT_EVIDENCE";
    recommendationReason = recommendation.limitations.join("; ");
  } else if (recommended && sameShadowCandidate(recommended, context.actual)) {
    status = "NO_BETTER_CANDIDATE";
    recommendationReason =
      "Historical controlled evidence does not indicate a better-supported alternative to the actual production selection.";
  } else if (recommended) {
    const controlled = filterControlledComparisonRecords(await store.query({ limit: 10_000 }));
    const recRecords = controlled.filter(
      (r) =>
        r.providerId === recommended.providerId &&
        r.modelId === recommended.modelId &&
        r.strategyId === recommended.strategyId,
    );
    if (recRecords.length === 0) {
      status = "CAPABILITY_MISMATCH";
      recommendationReason =
        "Recommended candidate lacks controlled evidence at this scope — capability or applicability mismatch.";
    } else if (
      recRecords.some((r) => r.benchmarkOutcome === "PROVIDER_OPERATIONAL_FAILURE")
    ) {
      status = "OPERATIONAL_RISK";
      recommendationReason =
        "Historical evidence indicates operational risk for the recommended candidate under comparable conditions.";
    } else {
      status = "SHADOW_RECOMMENDATION";
      recommendationReason =
        "Historical evidence indicates the shadow candidate may outperform the actual candidate under comparable conditions.";
    }
  }

  const actualFp = await analysis.combinationPerformance({
    providerId: context.actual.providerId,
    modelId: context.actual.modelId,
    strategyId: context.actual.strategyId,
    knowledgeId: context.actual.knowledgeId ?? context.actual.knowledgeVersion ?? "unknown",
    service: context.service,
    industry: context.industry,
    organizationId: context.organizationId,
  });

  const recFp =
    recommended != null
      ? await analysis.combinationPerformance({
          providerId: recommended.providerId,
          modelId: recommended.modelId,
          strategyId: recommended.strategyId,
          knowledgeId: recommended.knowledgeId ?? recommended.knowledgeVersion ?? "unknown",
          service: context.service,
          industry: context.industry,
          organizationId: context.organizationId,
        })
      : undefined;

  const implications = implicationFromFingerprints(actualFp, recFp);

  const promotionReadiness = assessPromotionReadiness({
    recommendation,
    actual: context.actual,
    recommended,
    actualFingerprint: actualFp,
    recommendedFingerprint: recFp,
    thresholds: loadPromotionReadinessThresholds(env),
  });

  const decision: ShadowDecision = Object.freeze({
    shadowDecisionId: createId("shadow"),
    productionExecutionId: context.productionExecutionId,
    requestId: context.requestId,
    status,
    actual: context.actual,
    ...(recommended ? { recommended } : {}),
    recommendationScope: scope,
    evidenceCount: recommendation.evidenceCount,
    validComparisonSamples: recommendation.validComparisonSamples,
    confidenceTier: recommendation.confidence,
    evidenceTier: recommendation.evidenceTier,
    observedAdvantage: recommendation.observedAdvantage,
    ...(implications.latency ? { latencyImplication: implications.latency } : {}),
    ...(implications.cost ? { costImplication: implications.cost } : {}),
    ...(implications.reliability ? { reliabilityImplication: implications.reliability } : {}),
    compatibilityStatus: recommendation.comparisonCompatibility,
    evaluationPlaneVersion: recommendation.versions.evaluationPlaneVersion,
    evaluatorVersion: recommendation.versions.evaluatorVersion,
    recommendationReason,
    limitations: Object.freeze([
      ...recommendation.limitations,
      "Shadow candidate was not executed for this production request.",
      "Observed production result differs from historical shadow recommendation.",
    ]),
    decisionTimestamp: nowIso(),
    promotionReadiness,
  });

  logShadowDecision(decision);
  if (recommended && status === "SHADOW_RECOMMENDATION") {
    logShadowComparison({
      actual: context.actual,
      recommended,
      observedAdvantage: recommendation.observedAdvantage,
      evidenceTier: resolveEvidenceTier(recommendation.validComparisonSamples),
      confidence: recommendation.confidence,
    });
  }

  return decision;
}

export function createShadowDecisionService(deps?: ShadowDecisionServiceDeps) {
  return Object.freeze({
    resolveShadowDecision: (context: ShadowDecisionContext) =>
      resolveShadowDecision(context, deps),
  });
}
