/**
 * Step 12/13 — Deterministic adaptive routing decision (no LLM routing).
 */

import { loadAdaptiveRoutingConfig } from "../../config/adaptive-routing-config";
import { createExperimentAnalysisService } from "../experiment/analysis/experiment-analysis-service";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { meetsConfidenceThreshold } from "../shadow/shadow-config";
import type { IRoutingPolicyStore } from "./routing-policy-store";
import { defaultRoutingPolicyStore } from "./routing-policy-store";
import type { IAdaptiveRoutingDecisionStore } from "./adaptive-routing-decision-store";
import { defaultAdaptiveRoutingDecisionStore } from "./adaptive-routing-decision-store";
import {
  ADAPTIVE_ROUTING_DECISION_VERSION,
  type AdaptiveRoutingDecision,
  type AdaptiveRoutingDecisionContext,
  type AdaptiveRoutingDecisionKind,
  type AdaptiveRoutingDecisionReason,
} from "./adaptive-routing-decision-contract";
import { selectMatchingPolicy, isPolicyExpired } from "./adaptive-scope-matcher";
import { deterministicRolloutBucket, isRolloutSelected } from "./adaptive-rollout";
import { logAdaptiveRoutingEnabled } from "./adaptive-routing-logger";
import { sameShadowCandidate } from "../shadow/shadow-candidate-catalog";
import {
  buildAdaptiveTelemetry,
  emitAdaptiveDecisionTelemetry,
} from "./adaptive-routing-telemetry";
import { validateAdaptivePolicy } from "./adaptive-policy-validator";
import type {
  AdaptiveCapabilityContext,
  AdaptiveCapabilityVerdict,
} from "./adaptive-candidate-capability";
import type { IAdaptiveRollbackStore } from "./adaptive-rollback-store";

export type AdaptiveRoutingDecisionServiceDeps = {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly policyStore?: IRoutingPolicyStore;
  readonly decisionStore?: IAdaptiveRoutingDecisionStore;
  readonly rollbackStore?: IAdaptiveRollbackStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
  readonly persistenceAvailable?: boolean;
  readonly failClosedWhenEnabledWithoutPersistence?: boolean;
  readonly isCandidateExecutable?: (input: AdaptiveCapabilityContext) => boolean;
  readonly verifyCandidateCapability?: (input: AdaptiveCapabilityContext) => AdaptiveCapabilityVerdict;
  readonly providerRegistry?: unknown;
  readonly modelRegistry?: unknown;
  readonly compatibilityEngine?: unknown;
};

function buildDecision(input: {
  readonly context: AdaptiveRoutingDecisionContext;
  readonly decision: AdaptiveRoutingDecisionKind;
  readonly reason: AdaptiveRoutingDecisionReason;
  readonly actual: AdaptiveRoutingDecision["actual"];
  readonly adaptive?: AdaptiveRoutingDecision["adaptive"];
  readonly evidence: AdaptiveRoutingDecision["evidence"];
  readonly provenance: AdaptiveRoutingDecision["provenance"];
  readonly rolloutBucket?: number;
  readonly rolloutPercentage?: number;
  readonly rolloutSelected?: boolean;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
  readonly telemetryEvent?: AdaptiveRoutingDecision["telemetry"];
}): AdaptiveRoutingDecision {
  const correlationId = input.context.executionId ?? input.context.requestId;
  return Object.freeze({
    decisionId: input.createId("adaptive"),
    decisionVersion: ADAPTIVE_ROUTING_DECISION_VERSION,
    requestId: input.context.requestId,
    executionId: input.context.executionId,
    timestamp: input.nowIso(),
    scope: input.context.scope,
    actual: input.actual,
    ...(input.adaptive ? { adaptive: input.adaptive } : {}),
    decision: input.decision,
    reason: input.reason,
    evidence: input.evidence,
    provenance: input.provenance,
    ...(input.rolloutBucket != null ? { rolloutBucket: input.rolloutBucket } : {}),
    ...(input.rolloutPercentage != null ? { rolloutPercentage: input.rolloutPercentage } : {}),
    ...(input.rolloutSelected != null ? { rolloutSelected: input.rolloutSelected } : {}),
    routingMode: input.decision === "USE_ADAPTIVE" ? "adaptive" : "static",
    correlationId,
    ...(input.telemetryEvent ? { telemetry: input.telemetryEvent } : {}),
  });
}

async function appendAndEmit(
  decisionStore: IAdaptiveRoutingDecisionStore,
  decision: AdaptiveRoutingDecision,
): Promise<AdaptiveRoutingDecision> {
  await decisionStore.append(decision);
  emitAdaptiveDecisionTelemetry(decision);
  return decision;
}

function capabilityContext(
  context: AdaptiveRoutingDecisionContext,
  candidate: { readonly providerId: string; readonly modelId: string },
): AdaptiveCapabilityContext {
  return Object.freeze({
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    capabilityId: context.capabilityId,
    service: context.scope.service,
    subtype: context.scope.subtype,
    outputKind: context.outputKind,
  });
}

/**
 * Resolve adaptive routing decision — deterministic, evidence-gated.
 * NEVER dispatches providers; caller applies pins to existing routing path.
 */
export async function resolveAdaptiveRoutingDecision(
  context: AdaptiveRoutingDecisionContext,
  deps?: AdaptiveRoutingDecisionServiceDeps,
): Promise<AdaptiveRoutingDecision> {
  const env = deps?.env ?? process.env;
  const config = loadAdaptiveRoutingConfig(env);
  logAdaptiveRoutingEnabled(config.adaptiveRoutingEnabled);

  const createId = deps?.createId ?? ((p: string) => `${p}_${context.requestId}`);
  const nowIso = deps?.nowIso ?? (() => new Date().toISOString());
  const policyStore = deps?.policyStore ?? defaultRoutingPolicyStore;
  const decisionStore = deps?.decisionStore ?? defaultAdaptiveRoutingDecisionStore;
  const recordStore = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const analysis = createExperimentAnalysisService({ recordStore });

  const emptyEvidence = Object.freeze({
    validComparisonSamples: 0,
    confidence: "insufficient",
  });

  const baseProvenance = Object.freeze({
    ...(context.contractVersion ? { contractVersion: context.contractVersion } : {}),
  });

  const reject = async (input: {
    readonly decision: AdaptiveRoutingDecisionKind;
    readonly reason: AdaptiveRoutingDecisionReason;
    readonly adaptive?: AdaptiveRoutingDecision["adaptive"];
    readonly evidence?: AdaptiveRoutingDecision["evidence"];
    readonly provenance?: AdaptiveRoutingDecision["provenance"];
    readonly rolloutBucket?: number;
    readonly rolloutPercentage?: number;
    readonly rolloutSelected?: boolean;
    readonly telemetryEvent?: AdaptiveRoutingDecision["telemetry"];
  }) =>
    appendAndEmit(
      decisionStore,
      buildDecision({
        context,
        decision: input.decision,
        reason: input.reason,
        actual: context.actual,
        adaptive: input.adaptive,
        evidence: input.evidence ?? emptyEvidence,
        provenance: input.provenance ?? baseProvenance,
        rolloutBucket: input.rolloutBucket,
        rolloutPercentage: input.rolloutPercentage,
        rolloutSelected: input.rolloutSelected,
        createId,
        nowIso,
        telemetryEvent: input.telemetryEvent,
      }),
    );

  if (!config.adaptiveRoutingEnabled) {
    return reject({
      decision: "USE_EXISTING",
      reason: "ADAPTIVE_DISABLED",
      telemetryEvent: buildAdaptiveTelemetry({
        event: "adaptive_rejected",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
      }),
    });
  }

  if (deps?.failClosedWhenEnabledWithoutPersistence) {
    return reject({
      decision: "USE_EXISTING",
      reason: "SAFETY_GUARD",
      telemetryEvent: buildAdaptiveTelemetry({
        event: "adaptive_rejected",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
      }),
    });
  }

  const policies = await policyStore.query({ lifecycle: "ACTIVE", enabled: true, limit: 1000 });
  const policy = selectMatchingPolicy(policies, context.scope, nowIso);

  if (!policy) {
    return reject({
      decision: "USE_EXISTING",
      reason: "CANDIDATE_UNAVAILABLE",
      telemetryEvent: buildAdaptiveTelemetry({
        event: "adaptive_considered",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
      }),
    });
  }

  const policyProvenance = Object.freeze({
    ...baseProvenance,
    routingPolicyId: policy.policyId,
    routingPolicyVersion: policy.policyVersion,
    promotionCandidateId: policy.promotionCandidateId,
  });

  if (isPolicyExpired(policy, nowIso)) {
    return reject({
      decision: "USE_EXISTING",
      reason: "CANDIDATE_EXPIRED",
      adaptive: policy.candidate,
      provenance: policyProvenance,
      telemetryEvent: buildAdaptiveTelemetry({
        event: "adaptive_rejected",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
      }),
    });
  }

  if (!policy.approvedBy?.trim() || !policy.approvedAt?.trim()) {
    return reject({
      decision: "USE_EXISTING",
      reason: "INVALID_POLICY",
      adaptive: policy.candidate,
      provenance: policyProvenance,
      telemetryEvent: buildAdaptiveTelemetry({
        event: "invalid_policy",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
      }),
    });
  }

  if (
    deps?.providerRegistry &&
    deps?.modelRegistry &&
    deps?.compatibilityEngine
  ) {
    const validation = validateAdaptivePolicy({
      policy,
      nowIso,
      providerRegistry: deps.providerRegistry as never,
      modelRegistry: deps.modelRegistry as never,
      compatibilityEngine: deps.compatibilityEngine as never,
    });
    if (!validation.valid) {
      return reject({
        decision: "USE_EXISTING",
        reason: "INVALID_POLICY",
        adaptive: policy.candidate,
        provenance: policyProvenance,
        telemetryEvent: buildAdaptiveTelemetry({
          event: "invalid_policy",
          staticProviderId: context.actual.providerId,
          staticModelId: context.actual.modelId,
          capabilityPass: false,
          capabilityReasons: validation.reasons,
        }),
      });
    }
  }

  const capCtx = capabilityContext(context, policy.candidate);
  const capabilityVerdict =
    deps?.verifyCandidateCapability?.(capCtx) ??
    (deps?.isCandidateExecutable
      ? {
          executable: deps.isCandidateExecutable(capCtx),
          reasons: deps.isCandidateExecutable(capCtx)
            ? Object.freeze([])
            : Object.freeze(["candidate not executable"]),
        }
      : undefined);

  if (capabilityVerdict && !capabilityVerdict.executable) {
    return reject({
      decision: "USE_EXISTING",
      reason: "CAPABILITY_MISMATCH",
      adaptive: policy.candidate,
      provenance: policyProvenance,
      telemetryEvent: buildAdaptiveTelemetry({
        event: "capability_mismatch",
        staticProviderId: context.actual.providerId,
        staticModelId: context.actual.modelId,
        capabilityPass: false,
        capabilityReasons: capabilityVerdict.reasons,
      }),
    });
  }

  const bucket = deterministicRolloutBucket({
    requestId: context.requestId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
  });
  const rolloutSelected = isRolloutSelected(bucket, policy.rolloutPercentage);

  const actualFp = await analysis.combinationPerformance({
    providerId: context.actual.providerId,
    modelId: context.actual.modelId,
    strategyId: context.actual.strategyId,
    knowledgeId: context.actual.knowledgeId ?? context.actual.knowledgeVersion ?? "unknown",
    service: context.scope.service,
    industry: context.scope.industry,
    organizationId: context.organizationId,
  });

  const adaptiveFp = await analysis.combinationPerformance({
    providerId: policy.candidate.providerId,
    modelId: policy.candidate.modelId,
    strategyId: policy.candidate.strategyId,
    knowledgeId: policy.candidate.knowledgeId ?? policy.candidate.knowledgeVersion ?? "unknown",
    service: context.scope.service,
    industry: context.scope.industry,
    organizationId: context.organizationId,
  });

  const adaptiveReliabilityRows = (
    await recordStore.query({
      providerId: policy.candidate.providerId,
      modelId: policy.candidate.modelId,
      strategyId: policy.candidate.strategyId,
      service: context.scope.service,
      industry: context.scope.industry,
      organizationId: context.organizationId,
      limit: 10_000,
    })
  ).filter(
    (r) =>
      r.knowledgeId === (policy.candidate.knowledgeId ?? "unknown") ||
      r.knowledgeVersion?.startsWith(policy.candidate.knowledgeId ?? "unknown"),
  );
  const adaptiveOperationalFailureRate =
    adaptiveReliabilityRows.length > 0
      ? adaptiveReliabilityRows.filter((r) => r.reliabilityStatus === "operational_failure")
          .length / adaptiveReliabilityRows.length
      : 0;

  const validSamples = adaptiveFp?.validComparisonSamples ?? 0;
  const confidence = adaptiveFp?.confidence.level ?? "insufficient";
  const observedAdvantage =
    adaptiveFp && actualFp
      ? adaptiveFp.qualityScoreMean - actualFp.qualityScoreMean
      : undefined;

  const evidence = Object.freeze({
    validComparisonSamples: validSamples,
    confidence,
    observedAdvantage,
    qualityDifference: observedAdvantage,
    latencyDifference:
      adaptiveFp && actualFp
        ? adaptiveFp.latencyMsMean - actualFp.latencyMsMean
        : undefined,
    costDifference:
      adaptiveFp && actualFp && adaptiveFp.costMean != null && actualFp.costMean != null
        ? adaptiveFp.costMean - actualFp.costMean
        : undefined,
    reliabilityDifference:
      adaptiveFp && actualFp
        ? adaptiveFp.operationalFailureRate - actualFp.operationalFailureRate
        : undefined,
  });

  const provenance = Object.freeze({
    ...policyProvenance,
    strategyVersion: policy.candidate.strategyVersion,
    knowledgeVersion: policy.candidate.knowledgeVersion,
    evaluatorVersion: adaptiveFp?.evaluatorVersion,
    evaluationPlaneVersion: adaptiveFp?.evaluationPlaneVersion,
    executionProfileVersion: adaptiveFp?.artifactEvaluatorVersion,
  });

  let decisionKind: AdaptiveRoutingDecisionKind = "USE_EXISTING";
  let reason: AdaptiveRoutingDecisionReason = "UNKNOWN";
  let telemetryEvent: AdaptiveRoutingDecision["telemetry"] = buildAdaptiveTelemetry({
    event: "adaptive_considered",
    staticProviderId: context.actual.providerId,
    staticModelId: context.actual.modelId,
    selectedProviderId: policy.candidate.providerId,
    selectedModelId: policy.candidate.modelId,
    capabilityPass: capabilityVerdict?.executable ?? true,
  });

  if (!rolloutSelected) {
    reason = "ROLLOUT_NOT_SELECTED";
    telemetryEvent = buildAdaptiveTelemetry({
      event: "adaptive_rejected",
      staticProviderId: context.actual.providerId,
      staticModelId: context.actual.modelId,
    });
  } else if (validSamples < policy.minimumSamples) {
    reason = "INSUFFICIENT_EVIDENCE";
    telemetryEvent = buildAdaptiveTelemetry({
      event: "insufficient_evidence",
      staticProviderId: context.actual.providerId,
      staticModelId: context.actual.modelId,
    });
  } else if (!meetsConfidenceThreshold(confidence, policy.minimumConfidence)) {
    reason = "LOW_CONFIDENCE";
    telemetryEvent = buildAdaptiveTelemetry({
      event: "adaptive_rejected",
      staticProviderId: context.actual.providerId,
      staticModelId: context.actual.modelId,
    });
  } else if (
    adaptiveFp &&
    actualFp &&
    adaptiveFp.costMean != null &&
    actualFp.costMean != null &&
    adaptiveFp.costMean > actualFp.costMean * policy.maxCostIncrease
  ) {
    reason = "COST_RISK";
    telemetryEvent = buildAdaptiveTelemetry({ event: "guardrail_failure", staticProviderId: context.actual.providerId, staticModelId: context.actual.modelId });
  } else if (
    adaptiveFp &&
    actualFp &&
    adaptiveFp.latencyMsMean > actualFp.latencyMsMean * policy.maxLatencyIncrease
  ) {
    reason = "LATENCY_RISK";
    telemetryEvent = buildAdaptiveTelemetry({ event: "guardrail_failure", staticProviderId: context.actual.providerId, staticModelId: context.actual.modelId });
  } else if (adaptiveOperationalFailureRate > policy.maxReliabilityRegression) {
    reason = "RELIABILITY_RISK";
    telemetryEvent = buildAdaptiveTelemetry({ event: "guardrail_failure", staticProviderId: context.actual.providerId, staticModelId: context.actual.modelId });
  } else if (
    adaptiveFp &&
    actualFp &&
    actualFp.qualityScoreMean - adaptiveFp.qualityScoreMean > policy.maxQualityRegression
  ) {
    reason = "SAFETY_GUARD";
    telemetryEvent = buildAdaptiveTelemetry({ event: "guardrail_failure", staticProviderId: context.actual.providerId, staticModelId: context.actual.modelId });
  } else if (sameShadowCandidate(policy.candidate, context.actual)) {
    reason = "APPROVED_CANDIDATE";
    decisionKind = "USE_EXISTING";
  } else {
    reason = "APPROVED_CANDIDATE";
    decisionKind = "USE_ADAPTIVE";
    telemetryEvent = buildAdaptiveTelemetry({
      event: "adaptive_selected",
      staticProviderId: context.actual.providerId,
      staticModelId: context.actual.modelId,
      selectedProviderId: policy.candidate.providerId,
      selectedModelId: policy.candidate.modelId,
      capabilityPass: true,
    });
  }

  return appendAndEmit(
    decisionStore,
    buildDecision({
      context,
      decision: decisionKind,
      reason,
      actual: context.actual,
      adaptive: policy.candidate,
      evidence,
      provenance,
      rolloutBucket: bucket,
      rolloutPercentage: policy.rolloutPercentage,
      rolloutSelected,
      createId,
      nowIso,
      telemetryEvent,
    }),
  );
}

export function createAdaptiveRoutingDecisionService(deps?: AdaptiveRoutingDecisionServiceDeps) {
  return Object.freeze({
    resolveAdaptiveRoutingDecision: (context: AdaptiveRoutingDecisionContext) =>
      resolveAdaptiveRoutingDecision(context, deps),
  });
}

export const defaultAdaptiveRoutingDecisionService = createAdaptiveRoutingDecisionService();
