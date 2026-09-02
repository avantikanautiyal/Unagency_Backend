/**
 * Durable execution observability store — append/finalize once per executionId.
 */

import type {
  DurableExecutionObservabilityRecord,
  ExecutionObservabilityFinalizeResult,
  ExecutionObservabilityQuery,
} from "./execution-observability-contract";

export interface IExecutionObservabilityStore {
  finalize(
    record: DurableExecutionObservabilityRecord,
  ): Promise<ExecutionObservabilityFinalizeResult>;
  getByExecutionId(
    executionId: string,
  ): Promise<DurableExecutionObservabilityRecord | undefined>;
  getByCorrelationId(
    correlationId: string,
    limit?: number,
  ): Promise<readonly DurableExecutionObservabilityRecord[]>;
  query(
    query: ExecutionObservabilityQuery,
  ): Promise<readonly DurableExecutionObservabilityRecord[]>;
}

export class InMemoryExecutionObservabilityStore implements IExecutionObservabilityStore {
  private readonly byExecutionId = new Map<string, DurableExecutionObservabilityRecord>();
  private readonly byCorrelationId = new Map<string, DurableExecutionObservabilityRecord[]>();
  private readonly ordered: DurableExecutionObservabilityRecord[] = [];

  async finalize(
    record: DurableExecutionObservabilityRecord,
  ): Promise<ExecutionObservabilityFinalizeResult> {
    if (this.byExecutionId.has(record.executionId)) return "duplicate";
    this.byExecutionId.set(record.executionId, record);
    this.ordered.push(record);
    const bucket = this.byCorrelationId.get(record.correlationId) ?? [];
    bucket.push(record);
    this.byCorrelationId.set(record.correlationId, bucket);
    return "inserted";
  }

  async getByExecutionId(
    executionId: string,
  ): Promise<DurableExecutionObservabilityRecord | undefined> {
    return this.byExecutionId.get(executionId);
  }

  async getByCorrelationId(
    correlationId: string,
    limit = 100,
  ): Promise<readonly DurableExecutionObservabilityRecord[]> {
    const rows = [...(this.byCorrelationId.get(correlationId) ?? [])];
    rows.sort((a, b) => (a.finalizedAt < b.finalizedAt ? 1 : -1));
    return rows.slice(0, limit);
  }

  async query(
    query: ExecutionObservabilityQuery,
  ): Promise<readonly DurableExecutionObservabilityRecord[]> {
    let rows = [...this.ordered];
    if (query.organizationId) {
      rows = rows.filter((r) => r.organizationId === query.organizationId);
    }
    if (query.service) rows = rows.filter((r) => r.service === query.service);
    if (query.subtype) rows = rows.filter((r) => r.subtype === query.subtype);
    if (query.outputKind) rows = rows.filter((r) => r.outputKind === query.outputKind);
    if (query.requestedProviderId) {
      rows = rows.filter((r) => r.requestedProviderId === query.requestedProviderId);
    }
    if (query.selectedProviderId) {
      rows = rows.filter((r) => r.selectedProviderId === query.selectedProviderId);
    }
    if (query.actualProviderId) {
      rows = rows.filter((r) => r.actualProviderId === query.actualProviderId);
    }
    if (query.actualModelId) rows = rows.filter((r) => r.actualModelId === query.actualModelId);
    if (query.executionStatus) {
      rows = rows.filter((r) => r.executionStatus === query.executionStatus);
    }
    if (query.integrityStatus) {
      rows = rows.filter((r) => r.integrityStatus === query.integrityStatus);
    }
    if (query.failureCategory) {
      rows = rows.filter((r) => r.failureCategory === query.failureCategory);
    }
    if (query.evidenceStatus) {
      rows = rows.filter((r) => r.evidenceStatus === query.evidenceStatus);
    }
    if (query.evaluationPlaneStatus) {
      rows = rows.filter((r) => r.evaluationPlaneStatus === query.evaluationPlaneStatus);
    }
    if (query.step2Status) rows = rows.filter((r) => r.step2Status === query.step2Status);
    if (query.sinceIso) rows = rows.filter((r) => r.finalizedAt >= query.sinceIso!);
    if (query.untilIso) rows = rows.filter((r) => r.finalizedAt <= query.untilIso!);
    rows.sort((a, b) => (a.finalizedAt < b.finalizedAt ? 1 : -1));
    return rows.slice(0, query.limit ?? 1000);
  }

  clear(): void {
    this.byExecutionId.clear();
    this.byCorrelationId.clear();
    this.ordered.length = 0;
  }
}

export class UnavailableExecutionObservabilityStore implements IExecutionObservabilityStore {
  async finalize(): Promise<ExecutionObservabilityFinalizeResult> {
    return "unavailable";
  }

  async getByExecutionId(): Promise<DurableExecutionObservabilityRecord | undefined> {
    return undefined;
  }

  async getByCorrelationId(): Promise<readonly DurableExecutionObservabilityRecord[]> {
    return Object.freeze([]);
  }

  async query(): Promise<readonly DurableExecutionObservabilityRecord[]> {
    return Object.freeze([]);
  }
}

export const defaultExecutionObservabilityStore = new InMemoryExecutionObservabilityStore();
