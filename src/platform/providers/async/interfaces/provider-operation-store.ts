/**
 * Durable provider operation persistence port.
 */

import type { ProviderOperationRecord } from "../contracts/provider-operation";
import type { ProviderOperationState } from "../contracts/provider-operation-state";

export interface IProviderOperationStore {
  create(record: ProviderOperationRecord): Promise<void>;
  get(operationId: string): Promise<ProviderOperationRecord | undefined>;
  getBySubmissionKey(submissionKey: string): Promise<ProviderOperationRecord | undefined>;
  getByExecutionId(executionId: string): Promise<ProviderOperationRecord | undefined>;
  /** All operations for an execution (primary + async failovers). */
  listByExecutionId(executionId: string): Promise<readonly ProviderOperationRecord[]>;
  update(record: ProviderOperationRecord): Promise<void>;
  listDueForPoll(nowMs: number, limit?: number): Promise<readonly ProviderOperationRecord[]>;

  tryClaim(
    operationId: string,
    workerId: string,
    leaseTtlMs: number,
    nowIso: string,
    nowMs: number
  ): Promise<ProviderOperationRecord | undefined>;

  releaseClaim(operationId: string): Promise<void>;

  reclaimExpiredLeases(nowIso: string, nowMs: number): Promise<readonly ProviderOperationRecord[]>;
}

export function buildSubmissionKey(input: {
  executionId: string;
  attemptId: string;
  providerId: string;
  capabilityId: string;
}): string {
  return `${input.executionId}:${input.attemptId}:${input.providerId}:${input.capabilityId}`;
}

export function transitionOperation(
  record: ProviderOperationRecord,
  to: ProviderOperationState,
  nowIso: string,
  patch: Partial<ProviderOperationRecord> = {}
): ProviderOperationRecord {
  return {
    ...record,
    ...patch,
    state: to,
    updatedAt: nowIso,
  };
}
