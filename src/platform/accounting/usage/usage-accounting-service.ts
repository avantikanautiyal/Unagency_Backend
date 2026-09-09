/**
 * Central usage accounting service — records provider invocations into the ledger.
 */

import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../providers/runtime/contracts/provider-execution-response";
import { AI_COST_STATUS, AI_USAGE_INVOCATION_STATUS } from "../contracts/enums";
import {
  deriveIdempotencyKey,
  type CreateAIUsageRecordInput,
} from "../contracts/ai-usage-record";
import { CostCalculator } from "../cost/cost-calculator";
import type { IUsageLedger } from "../ledger/usage-ledger";
import type { IPricingRegistry } from "../pricing/pricing-registry";
import type { IFxRateService } from "../pricing/fx-rate-service";
import { normalizeFromCanonicalUsage } from "../usage/adapters/normalize-provider-usage";
import type { NormalizedAIUsage } from "../contracts/ai-usage";
import {
  incrementAccountingMetric,
  logAccountingError,
  recordLedgerWriteLatency,
} from "../observability/accounting-metrics";
import { CALCULATION_VERSION } from "../contracts/ai-cost";

export interface ProviderInvocationAccountingEvent {
  readonly request: ProviderExecutionRequest;
  readonly response?: ProviderExecutionResponse;
  readonly success: boolean;
  readonly completedAt: string;
  readonly latencyMs?: number | null;
  readonly pipelineAttempt?: number;
  readonly sessionId?: string;
  readonly jobId?: string | null;
  readonly attemptId?: string | null;
  readonly operationId?: string | null;
  readonly providerJobId?: string | null;
  readonly service?: string | null;
  readonly retryCount?: number;
  readonly timedOut?: boolean;
}

export interface IUsageAccountingService {
  recordProviderInvocation(event: ProviderInvocationAccountingEvent): Promise<void>;
  reconcileLateCompletion(event: ProviderInvocationAccountingEvent): Promise<void>;
}

export class UsageAccountingService implements IUsageAccountingService {
  constructor(
    private readonly ledger: IUsageLedger,
    private readonly pricing: IPricingRegistry,
    private readonly fx?: IFxRateService
  ) {}

  private readonly calculator = new CostCalculator(this.pricing, this.fx);

  async recordProviderInvocation(event: ProviderInvocationAccountingEvent): Promise<void> {
    const started = Date.now();
    try {
      if (event.timedOut && !event.response?.providerRequestId) {
        await this.recordPendingInvocation(event);
        return;
      }

      const input = this.buildRecordInput(event);
      const result = await this.ledger.recordUsage(input);
      if (result.created) {
        incrementAccountingMetric("usageRecordsCreated");
        if (input.cost.costStatus === AI_COST_STATUS.PENDING_PRICING) {
          incrementAccountingMetric("pendingPricingRecords");
        }
        if (input.cost.costStatus === AI_COST_STATUS.PENDING_PROVIDER_USAGE) {
          incrementAccountingMetric("pendingProviderUsageRecords");
        }
      } else {
        incrementAccountingMetric("usageRecordsDeduplicated");
      }
    } catch (error) {
      logAccountingError("record_provider_invocation", error, {
        executionId: String(event.request.context.executionId),
        providerId: String(event.request.providerId),
      });
      throw error;
    } finally {
      recordLedgerWriteLatency(Date.now() - started);
    }
  }

  /**
   * Late completion after timeout or async poll — update existing record, never duplicate.
   */
  async reconcileLateCompletion(event: ProviderInvocationAccountingEvent): Promise<void> {
    const started = Date.now();
    try {
      const providerRequestId =
        event.response?.providerRequestId ??
        (event.response?.usage as Record<string, unknown> | undefined)?.providerRequestId;

      if (providerRequestId) {
        const existing = await this.ledger.findByProviderRequestId(
          String(event.request.providerId),
          String(providerRequestId)
        );
        if (existing) {
          await this.updateExistingRecord(existing.usageRecordId, event);
          return;
        }
      }

      if (event.operationId) {
        const byOp = await this.ledger.findPendingByOperationId(event.operationId);
        if (byOp) {
          await this.updateExistingRecord(byOp.usageRecordId, event);
          return;
        }
      }

      await this.recordProviderInvocation({ ...event, timedOut: false });
    } catch (error) {
      logAccountingError("reconcile_late_completion", error, {
        operationId: event.operationId,
        providerRequestId: event.response?.providerRequestId,
      });
      throw error;
    } finally {
      recordLedgerWriteLatency(Date.now() - started);
    }
  }

  private async recordPendingInvocation(event: ProviderInvocationAccountingEvent): Promise<void> {
    const emptyUsage: NormalizedAIUsage = {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      cachedOutputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      otherUnits: [],
      providerRequestId: null,
      rawProviderUsage: null,
    };

    const pendingCost = {
      estimatedInputCostUsd: null,
      estimatedOutputCostUsd: null,
      estimatedCachedCostUsd: null,
      estimatedReasoningCostUsd: null,
      estimatedOtherCostUsd: null,
      estimatedTotalCostUsd: null,
      originalCurrency: "USD",
      originalAmount: null,
      reportingCurrency: "USD",
      reportingAmountUsd: null,
      exchangeRate: null,
      exchangeRateVersion: null,
      exchangeRateTimestamp: null,
      costStatus: AI_COST_STATUS.PENDING_PROVIDER_USAGE,
      pricingVersion: null,
      pricingEffectiveAt: null,
      calculationVersion: CALCULATION_VERSION,
      unitPricesApplied: [],
    };

    const input = this.buildRecordInput({
      ...event,
      response: undefined,
      success: false,
    });
    await this.ledger.recordUsage({
      ...input,
      usage: emptyUsage,
      cost: pendingCost,
      invocationStatus: AI_USAGE_INVOCATION_STATUS.FAILED,
    });
    incrementAccountingMetric("pendingProviderUsageRecords");
  }

  private async updateExistingRecord(
    usageRecordId: string,
    event: ProviderInvocationAccountingEvent
  ): Promise<void> {
    const input = this.buildRecordInput(event);
    const updated = await this.ledger.updateUsageRecord(usageRecordId, {
      usage: input.usage,
      cost: input.cost,
      invocationStatus: input.invocationStatus,
      completedAt: input.completedAt,
      providerRequestId: input.providerRequestId,
      latencyMs: input.latencyMs,
      providerJobId: event.providerJobId ?? null,
      accountingState: "RECONCILED",
    });
    if (updated) incrementAccountingMetric("usageRecordsUpdated");
  }

  private buildRecordInput(event: ProviderInvocationAccountingEvent): CreateAIUsageRecordInput {
    const { request, response, success, completedAt } = event;
    const context = request.context;
    const metadata = request.metadata ?? {};

    const usage = response
      ? normalizeFromCanonicalUsage(
          response.usage as Readonly<Record<string, unknown>> | undefined,
          String(request.providerId),
          String(request.capabilityId),
          response.providerRequestId
        )
      : {
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          cachedOutputTokens: null,
          reasoningTokens: null,
          totalTokens: null,
          otherUnits: [],
          providerRequestId: null,
          rawProviderUsage: null,
        };

    const idempotencyKey = deriveIdempotencyKey({
      providerId: String(request.providerId),
      providerRequestId: usage.providerRequestId ?? response?.providerRequestId,
      executionId: String(context.executionId),
      attemptId: event.attemptId ?? (metadata.attemptId as string | undefined),
      operationId: event.operationId ?? (metadata.operationId as string | undefined),
      internalRequestId: request.requestId,
      pipelineAttempt: event.pipelineAttempt,
      sessionId: event.sessionId,
    });

    const cost = this.calculator.calculate({
      providerId: String(request.providerId),
      modelId: String(request.modelId ?? metadata.modelId ?? "unknown"),
      capabilityId: String(request.capabilityId),
      usage,
      asOf: completedAt,
    });

    return {
      providerId: String(request.providerId),
      modelId: String(request.modelId ?? metadata.modelId ?? "unknown"),
      internalRequestId: request.requestId,
      providerRequestId: usage.providerRequestId ?? response?.providerRequestId ?? null,
      executionId: String(context.executionId),
      jobId: event.jobId ?? (metadata.jobId as string | undefined) ?? null,
      attemptId: event.attemptId ?? (metadata.attemptId as string | undefined) ?? null,
      operationId: event.operationId ?? (metadata.operationId as string | undefined) ?? null,
      correlationId: context.correlationId ?? (metadata.correlationId as string | undefined) ?? null,
      organizationId: String(context.organizationId),
      workspaceId: context.workspaceId ? String(context.workspaceId) : null,
      userId: (metadata.userId as string | undefined) ?? null,
      service: event.service ?? (metadata.service as string | undefined) ?? String(request.capabilityId),
      operation: (metadata.operation as string | undefined) ?? null,
      capabilityId: String(request.capabilityId),
      startedAt: request.createdAt,
      completedAt,
      latencyMs: event.latencyMs ?? null,
      invocationStatus: success
        ? AI_USAGE_INVOCATION_STATUS.SUCCEEDED
        : AI_USAGE_INVOCATION_STATUS.FAILED,
      retryCount: event.retryCount ?? 0,
      usage,
      cost,
      idempotencyKey,
      pipelineAttempt: event.pipelineAttempt,
      sessionId: event.sessionId,
    };
  }
}

let noopAccounting: IUsageAccountingService = {
  async recordProviderInvocation() {
    /* observability disabled */
  },
  async reconcileLateCompletion() {
    /* observability disabled */
  },
};

export function getUsageAccountingService(): IUsageAccountingService {
  return noopAccounting;
}

export function setUsageAccountingService(service: IUsageAccountingService): void {
  noopAccounting = service;
}
