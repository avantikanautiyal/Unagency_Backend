/**
 * Writes performance evidence after provider attempts + optional evaluation.
 * M9.5Q: attaches Cost Intelligence when a calculator/catalogue is available.
 */

import type { PerformanceEvidence } from "../contracts/performance-evidence";
import type { IModelPerformanceStore } from "../interfaces/model-performance-store";
import type { ProviderAttemptRecord } from "../failover/failover-types";
import type { ProviderExecutionResult } from "../../../runtime/contracts/provider-execution-response";
import type { IRoutingHistory } from "../../interfaces/routing";
import { asCapabilityId, asProviderId } from "../../../../shared/identifiers";
import type { CostCalculator } from "../../../../cost/calculator/cost-calculator";
import type { CanonicalCostRecord } from "../../../../cost/contracts/cost-integrity";

export interface EvidenceWriteContext {
  readonly executionId: string;
  readonly organizationId: string;
  readonly capabilityId: string;
  readonly routingDecisionId?: string;
  readonly evaluationScore?: number;
  readonly evaluationDimensions?: Readonly<Record<string, number>>;
  readonly artifactIds?: readonly string[];
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
  /** Optional precomputed cost (async reconciliation / tests). */
  readonly costRecord?: CanonicalCostRecord;
}

function usageNumber(
  usage: Readonly<Record<string, unknown>> | undefined,
  keys: string[]
): number | undefined {
  if (!usage) return undefined;
  for (const k of keys) {
    const v = usage[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  }
  return undefined;
}

export class PerformanceEvidenceWriter {
  constructor(
    private readonly store: IModelPerformanceStore,
    private readonly routingHistory?: IRoutingHistory,
    private readonly costCalculator?: CostCalculator
  ) {}

  async recordAttempt(
    attempt: ProviderAttemptRecord,
    result: ProviderExecutionResult,
    ctx: EvidenceWriteContext
  ): Promise<void> {
    const usage = result.response?.usage;
    const inputTokens = usageNumber(usage, ["inputTokens", "prompt_tokens", "input", "promptTokens"]);
    const outputTokens = usageNumber(usage, [
      "outputTokens",
      "completion_tokens",
      "output",
      "completionTokens",
    ]);
    const totalTokens =
      usageNumber(usage, ["totalTokens", "total_tokens", "tokens"]) ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined);

    const cost =
      ctx.costRecord ??
      (this.costCalculator
        ? this.costCalculator.calculate({
            providerId: attempt.providerId,
            modelId: attempt.modelId,
            capabilityId: ctx.capabilityId,
            usage: usage ?? null,
            nowIso: ctx.nowIso(),
            rejectClientCostFields: true,
            // Never take monetary cost from opaque usage alone (spoof risk).
            providerReported: null,
          })
        : undefined);

    // Persist known calculated amounts; routing uses costEligible separately.
    // Never invent — unknown stays null.
    const estimatedCost =
      cost && cost.amount != null && Number.isFinite(cost.amount) ? cost.amount : null;

    const evidence: PerformanceEvidence = {
      evidenceId: ctx.createId("evidence"),
      executionId: ctx.executionId,
      attemptId: attempt.attemptId,
      organizationId: ctx.organizationId,
      capabilityId: ctx.capabilityId,
      providerId: attempt.providerId,
      modelId: attempt.modelId,
      routingDecisionId: ctx.routingDecisionId,
      positionInRoute: attempt.positionInRoute,
      primaryOrFailover: attempt.primaryOrFailover,
      exploratory: attempt.exploratory,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      latencyMs: attempt.latencyMs,
      success: attempt.success,
      failureCategory: attempt.failureCategory,
      evaluationScore:
        attempt.success && ctx.evaluationScore !== undefined
          ? ctx.evaluationScore
          : undefined,
      evaluationDimensions:
        attempt.success && ctx.evaluationDimensions
          ? ctx.evaluationDimensions
          : undefined,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      costEligible: cost?.routingEligible === true && estimatedCost != null,
      costCurrency: estimatedCost != null ? cost?.currency ?? null : null,
      pricingVersion: cost?.pricingVersion ?? null,
      costStatus: cost?.status,
      costMethod: cost?.method,
      costTrust: cost?.trust,
      retryCount: result.statistics.attempts > 0 ? result.statistics.attempts - 1 : 0,
      timeoutOccurred:
        attempt.failureCategory === "timeout" || result.status === "timed_out",
      rateLimited: attempt.failureCategory === "rate_limit",
      artifactIds: attempt.success ? ctx.artifactIds : undefined,
      infrastructureFailure: attempt.failureCategory === "infrastructure",
      recordedAt: ctx.nowIso(),
    };

    await this.store.recordIdempotent(evidence);

    this.routingHistory?.record({
      providerId: asProviderId(attempt.providerId),
      capabilityId: asCapabilityId(ctx.capabilityId),
      success: attempt.success,
      latencyMs: attempt.latencyMs,
      qualityScore:
        attempt.success && ctx.evaluationScore !== undefined
          ? ctx.evaluationScore
          : undefined,
      recordedAt: ctx.nowIso(),
    });
  }

  async recordAttempts(
    attempts: readonly ProviderAttemptRecord[],
    resultsByAttemptId: ReadonlyMap<string, ProviderExecutionResult>,
    ctx: EvidenceWriteContext
  ): Promise<void> {
    for (const attempt of attempts) {
      const result = resultsByAttemptId.get(attempt.attemptId);
      if (!result) continue;
      await this.recordAttempt(attempt, result, ctx);
    }
  }
}
