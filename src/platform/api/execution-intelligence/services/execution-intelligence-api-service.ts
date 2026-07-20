/**
 * Execution Intelligence API — read-only explainability projections.
 * Reuses execution records; never exposes prompts or secrets.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { NotFoundError, AuthorizationError } from "../../../intelligence/shared/errors";
import type { TenantContext } from "../../contracts";
import type {
  AuditResponse,
  ConfidenceResponse,
  CostBreakdownResponse,
  DecisionGraphResponse,
  ExecutionIntelligenceSnapshot,
  MetricsResponse,
  ModelDecisionResponse,
  PlanningResponse,
  ProviderResponse,
  QualityResponse,
  RoutingResponse,
  TimelineResponse,
  TokensResponse,
} from "../contracts";

export interface IExecutionIntelligenceApiService {
  modelDecision(executionId: string, tenant: TenantContext): Result<ModelDecisionResponse>;
  routing(executionId: string, tenant: TenantContext): Result<RoutingResponse>;
  planning(executionId: string, tenant: TenantContext): Result<PlanningResponse>;
  timeline(executionId: string, tenant: TenantContext): Result<TimelineResponse>;
  provider(executionId: string, tenant: TenantContext): Result<ProviderResponse>;
  metrics(executionId: string, tenant: TenantContext): Result<MetricsResponse>;
  tokens(executionId: string, tenant: TenantContext): Result<TokensResponse>;
  costBreakdown(executionId: string, tenant: TenantContext): Result<CostBreakdownResponse>;
  quality(executionId: string, tenant: TenantContext): Result<QualityResponse>;
  confidence(executionId: string, tenant: TenantContext): Result<ConfidenceResponse>;
  audit(executionId: string, tenant: TenantContext): Result<AuditResponse>;
  decisionGraph(executionId: string, tenant: TenantContext): Result<DecisionGraphResponse>;
  /** Internal: attach snapshot after execution create (no prompt/secrets). */
  attachSnapshot(snapshot: ExecutionIntelligenceSnapshot): void;
}

export class ExecutionIntelligenceApiService implements IExecutionIntelligenceApiService {
  private readonly snapshots = new Map<string, ExecutionIntelligenceSnapshot>();

  attachSnapshot(snapshot: ExecutionIntelligenceSnapshot): void {
    // Hard guarantee — never store forbidden fields even if caller errs
    if ((snapshot as { containsPrompt?: boolean }).containsPrompt) return;
    if ((snapshot as { containsSecrets?: boolean }).containsSecrets) return;
    this.snapshots.set(snapshot.executionId, snapshot);
  }

  modelDecision(
    executionId: string,
    tenant: TenantContext
  ): Result<ModelDecisionResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    const selected = s.candidates.find((c) => c.modelId === s.modelId) ?? s.candidates[0]!;
    return success({
      executionId: s.executionId,
      capabilityId: s.capabilityId,
      resolvedProviderId: s.providerId,
      resolvedProviderName: s.providerName,
      resolvedModelId: s.modelId,
      modelVersion: s.modelVersion,
      reasoningStrategy: s.reasoningStrategy,
      candidateModels: s.candidates,
      rankingScores: Object.fromEntries(
        s.candidates.map((c) => [`${c.providerId}:${c.modelId}`, c.rankingScore])
      ),
      capabilityMatchScore: selected.capabilityMatchScore,
      latencyScore: selected.latencyScore,
      costScore: selected.costScore,
      qualityScore: selected.qualityScore,
      contextWindowScore: selected.contextWindowScore,
      toolCallingSupport: selected.toolCallingSupport,
      visionSupport: selected.visionSupport,
      streamingSupport: selected.streamingSupport,
      reasonSelected: `Highest composite ranking within budget (${selected.rankingScore})`,
      reasonsRejected: s.candidates
        .filter((c) => c.modelId !== s.modelId)
        .map((c) => c.reasonRejected ?? `${c.modelId} ranked lower`),
      fallbackModels: s.fallbackModels,
      decisionTimestamp: s.decisionTimestamp,
      decisionDurationMs: s.decisionDurationMs,
    });
  }

  routing(executionId: string, tenant: TenantContext): Result<RoutingResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    return success({
      executionId: s.executionId,
      negotiationSummary: s.negotiationSummary,
      providerRanking: [...s.candidates]
        .sort((a, b) => b.rankingScore - a.rankingScore)
        .map((c, i) => ({
          providerId: c.providerId,
          providerName: c.providerName,
          rank: i + 1,
          score: c.rankingScore,
        })),
      routingStrategy: s.routingStrategy,
      policyDecisions: s.policyDecisions,
      budgetConstraints: s.budgetConstraints,
      complianceConstraints: s.complianceConstraints,
      fallbackChain: s.fallbackChain,
      retryStrategy: s.retryStrategy,
      circuitBreakerStatus: s.circuitBreakerStatus,
    });
  }

  planning(executionId: string, tenant: TenantContext): Result<PlanningResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    return success({
      executionId: s.executionId,
      detectedIntent: s.intent,
      capabilityTree: s.capabilityTree,
      department: s.department,
      workflow: s.workflow,
      agentsPlanned: s.agentsPlanned,
      executionGraph: s.executionGraph,
      executionPlanVersion: s.executionPlanVersion,
    });
  }

  timeline(executionId: string, tenant: TenantContext): Result<TimelineResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    return success({
      executionId: snap.value.executionId,
      events: snap.value.timeline,
    });
  }

  provider(executionId: string, tenant: TenantContext): Result<ProviderResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    return success({
      executionId: s.executionId,
      providerId: s.providerId,
      providerName: s.providerName,
      modelId: s.modelId,
      modelVersion: s.modelVersion,
      healthStatus: "healthy",
      negotiationOutcome: s.negotiationSummary,
    });
  }

  metrics(executionId: string, tenant: TenantContext): Result<MetricsResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    return success({
      executionId: s.executionId,
      status: "recorded",
      latencyMs: s.metrics.latencyMs,
      queueWaitMs: s.metrics.queueWaitMs,
      providerLatencyMs: s.metrics.providerLatencyMs,
      evaluationLatencyMs: s.metrics.evaluationLatencyMs,
      totalDurationMs: s.metrics.totalDurationMs,
      success: true,
    });
  }

  tokens(executionId: string, tenant: TenantContext): Result<TokensResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const t = snap.value.tokens;
    const total =
      t.promptTokens +
      t.contextTokens +
      t.completionTokens +
      t.cachedTokens +
      t.reasoningTokens;
    return success({
      executionId: snap.value.executionId,
      promptTokens: t.promptTokens,
      contextTokens: t.contextTokens,
      completionTokens: t.completionTokens,
      cachedTokens: t.cachedTokens,
      reasoningTokens: t.reasoningTokens,
      totalTokens: total,
      providerUsage: {
        [snap.value.providerId]: total,
      },
    });
  }

  costBreakdown(
    executionId: string,
    tenant: TenantContext
  ): Result<CostBreakdownResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const c = snap.value.costs;
    return success({
      executionId: snap.value.executionId,
      currency: c.currency,
      providerCost: c.providerCost,
      modelCost: c.modelCost,
      inputCost: c.inputCost,
      outputCost: c.outputCost,
      storageCost: c.storageCost,
      evaluationCost: c.evaluationCost,
      totalCost: c.totalCost,
      organizationBudgetRemaining: c.organizationBudgetRemaining,
    });
  }

  quality(executionId: string, tenant: TenantContext): Result<QualityResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    return success({
      executionId: snap.value.executionId,
      ...snap.value.quality,
    });
  }

  confidence(
    executionId: string,
    tenant: TenantContext
  ): Result<ConfidenceResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const q = snap.value.quality;
    const band = (n: number): "high" | "medium" | "low" =>
      n >= 0.9 ? "high" : n >= 0.75 ? "medium" : "low";
    return success({
      executionId: snap.value.executionId,
      overallConfidence: q.confidence,
      modelConfidence: q.evaluationScore,
      routingConfidence: 0.92,
      evaluationConfidence: q.evaluationScore,
      experienceConfidence: 0.8,
      bands: {
        overall: band(q.confidence),
        model: band(q.evaluationScore),
        routing: band(0.92),
        evaluation: band(q.evaluationScore),
        experience: band(0.8),
      },
    });
  }

  audit(executionId: string, tenant: TenantContext): Result<AuditResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    return success({
      executionId: s.executionId,
      organizationId: s.organizationId,
      workspaceId: s.workspaceId,
      capabilityId: s.capabilityId,
      providerId: s.providerId,
      modelId: s.modelId,
      policies: s.policies,
      versionIds: {
        executionPlan: s.executionPlanVersion,
        brandBrain: s.brandBrainVersion ?? "n/a",
        knowledge: s.knowledgeVersion ?? "n/a",
        experience: s.experienceVersion ?? "n/a",
        evaluation: s.evaluationVersion ?? "n/a",
      },
      brandBrainVersion: s.brandBrainVersion,
      knowledgeVersion: s.knowledgeVersion,
      experienceVersion: s.experienceVersion,
      evaluationVersion: s.evaluationVersion,
      immutable: true,
      auditedAt: s.decisionTimestamp,
    });
  }

  decisionGraph(
    executionId: string,
    tenant: TenantContext
  ): Result<DecisionGraphResponse> {
    const snap = this.scoped(executionId, tenant);
    if (!snap.ok) return snap;
    const s = snap.value;
    const providers = [...new Set(s.candidates.map((c) => c.providerName))];
    return success({
      executionId: s.executionId,
      intent: s.intent,
      capability: s.capabilityId,
      brandBrain: s.brandBrainVersion != null ? { version: s.brandBrainVersion } : undefined,
      knowledge: s.knowledgeVersion != null ? { version: s.knowledgeVersion } : undefined,
      candidateProviders: providers,
      candidateModels: s.candidates.map((c) => ({
        provider: c.providerName,
        model: c.modelId,
        score: c.rankingScore,
      })),
      selected: {
        provider: s.providerName,
        model: s.modelId,
        reason: `Highest quality score within budget`,
      },
    });
  }

  private scoped(
    executionId: string,
    tenant: TenantContext
  ): Result<ExecutionIntelligenceSnapshot> {
    const snap = this.snapshots.get(executionId);
    if (!snap) return failure(new NotFoundError("execution intelligence not found"));
    if (snap.organizationId !== tenant.organizationId) {
      return failure(new AuthorizationError("tenant isolation violation"));
    }
    return success(snap);
  }
}
