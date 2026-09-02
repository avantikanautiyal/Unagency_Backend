/**
 * Central usage accounting service — records provider invocations into the ledger.
 */

import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../providers/runtime/contracts/provider-execution-response";
import { AI_USAGE_INVOCATION_STATUS } from "../contracts/enums";
import {
  deriveIdempotencyKey,
  type CreateAIUsageRecordInput,
} from "../contracts/ai-usage-record";
import { CostCalculator } from "../cost/cost-calculator";
import type { IUsageLedger } from "../ledger/usage-ledger";
import type { IPricingRegistry } from "../pricing/pricing-registry";
import type { IFxRateService } from "../pricing/fx-rate-service";
import { normalizeFromCanonicalUsage } from "../usage/adapters/normalize-provider-usage";

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
  readonly service?: string | null;
  readonly retryCount?: number;
}

export interface IUsageAccountingService {
  recordProviderInvocation(event: ProviderInvocationAccountingEvent): Promise<void>;
}

export class UsageAccountingService implements IUsageAccountingService {
  constructor(
    private readonly ledger: IUsageLedger,
    private readonly pricing: IPricingRegistry,
    private readonly fx?: IFxRateService
  ) {}

  private readonly calculator = new CostCalculator(this.pricing, this.fx);

  async recordProviderInvocation(event: ProviderInvocationAccountingEvent): Promise<void> {
    const { request, response, success, completedAt } = event;
    const context = request.context;
    const metadata = request.metadata ?? {};

    const usage = normalizeFromCanonicalUsage(
      response?.usage as Readonly<Record<string, unknown>> | undefined,
      String(request.providerId),
      String(request.capabilityId),
      response?.providerRequestId
    );

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

    const input: CreateAIUsageRecordInput = {
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

    await this.ledger.recordUsage(input);
  }
}

let noopAccounting: IUsageAccountingService = {
  async recordProviderInvocation() {
    /* observability disabled */
  },
};

export function getUsageAccountingService(): IUsageAccountingService {
  return noopAccounting;
}

export function setUsageAccountingService(service: IUsageAccountingService): void {
  noopAccounting = service;
}
