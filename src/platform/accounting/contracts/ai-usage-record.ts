/**
 * Canonical AI usage record — one row per actual provider API invocation.
 */

import type { AICostBreakdown } from "./ai-cost";
import type { AICostStatus, AIUsageInvocationStatus } from "./enums";
import type { NormalizedAIUsage } from "./ai-usage";

export interface AIUsageRecord {
  readonly usageRecordId: string;
  readonly idempotencyKey: string;

  readonly providerId: string;
  readonly providerAccount: string | null;
  readonly modelId: string;

  readonly internalRequestId: string;
  readonly providerRequestId: string | null;

  readonly executionId: string;
  readonly jobId: string | null;
  readonly attemptId: string | null;
  readonly operationId: string | null;
  readonly correlationId: string | null;

  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly userId: string | null;

  readonly service: string | null;
  readonly operation: string | null;
  readonly capabilityId: string;

  readonly startedAt: string | null;
  readonly completedAt: string;
  readonly createdAt: string;
  readonly latencyMs: number | null;

  readonly invocationStatus: AIUsageInvocationStatus;
  readonly retryCount: number;

  readonly usage: NormalizedAIUsage;

  readonly cost: AICostBreakdown;
  readonly actualProviderCostUsd: string | null;

  readonly billingPeriod: string;

  readonly rawProviderUsage: Readonly<Record<string, unknown>> | null;
}

export interface CreateAIUsageRecordInput {
  readonly providerId: string;
  readonly providerAccount?: string | null;
  readonly modelId: string;
  readonly internalRequestId: string;
  readonly providerRequestId?: string | null;
  readonly executionId: string;
  readonly jobId?: string | null;
  readonly attemptId?: string | null;
  readonly operationId?: string | null;
  readonly correlationId?: string | null;
  readonly organizationId: string;
  readonly workspaceId?: string | null;
  readonly userId?: string | null;
  readonly service?: string | null;
  readonly operation?: string | null;
  readonly capabilityId: string;
  readonly startedAt?: string | null;
  readonly completedAt: string;
  readonly latencyMs?: number | null;
  readonly invocationStatus: AIUsageInvocationStatus;
  readonly retryCount?: number;
  readonly usage: NormalizedAIUsage;
  readonly cost: AICostBreakdown;
  readonly actualProviderCostUsd?: string | null;
  readonly idempotencyKey: string;
  readonly pipelineAttempt?: number;
  readonly sessionId?: string;
}

export function deriveIdempotencyKey(input: {
  readonly providerId: string;
  readonly providerRequestId?: string | null;
  readonly executionId: string;
  readonly attemptId?: string | null;
  readonly operationId?: string | null;
  readonly internalRequestId: string;
  readonly pipelineAttempt?: number;
  readonly sessionId?: string;
}): string {
  const providerRequestId = String(input.providerRequestId ?? "").trim();
  if (providerRequestId) {
    return `${input.providerId}:${providerRequestId}`;
  }

  const parts = [
    input.providerId,
    input.executionId,
    input.attemptId ?? "",
    input.operationId ?? "",
    input.internalRequestId,
    input.sessionId ?? "",
    String(input.pipelineAttempt ?? 1),
  ];
  return parts.join(":");
}

export function isCostKnown(status: AICostStatus): boolean {
  return status === "CALCULATED" || status === "RECONCILED";
}

export function isCostPending(status: AICostStatus): boolean {
  return (
    status === "PENDING_PRICING" ||
    status === "PENDING_PROVIDER_USAGE" ||
    status === "PENDING_CONVERSION"
  );
}
