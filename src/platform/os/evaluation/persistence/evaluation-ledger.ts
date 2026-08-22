/**
 * Phase 8 — Durable evaluation ledger (append-only / immutable records).
 */

import type { EvaluationResult } from "../contracts/evaluation-result";
import type { AggregateEvaluation } from "../engine/evaluation-engine";

export interface EvaluationLedgerRecord {
  readonly recordId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId?: string;
  readonly outputRefId?: string;
  readonly results: readonly EvaluationResult[];
  readonly worstOutcome: AggregateEvaluation["worstOutcome"];
  readonly aggregateScores: AggregateEvaluation["aggregateScores"];
  readonly evaluatedAt: string;
  readonly runtimeVersion: string;
}

export interface IEvaluationLedger {
  append(record: EvaluationLedgerRecord): Promise<EvaluationLedgerRecord>;
  get(
    recordId: string,
    organizationId: string
  ): Promise<EvaluationLedgerRecord | undefined>;
  listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly EvaluationLedgerRecord[]>;
}

export class InMemoryEvaluationLedger implements IEvaluationLedger {
  private readonly byId = new Map<string, EvaluationLedgerRecord>();

  clear(): void {
    this.byId.clear();
  }

  async append(record: EvaluationLedgerRecord): Promise<EvaluationLedgerRecord> {
    const existing = this.byId.get(record.recordId);
    if (existing) {
      if (existing.organizationId !== record.organizationId) {
        throw new Error("EVAL_TENANT_VIOLATION");
      }
      // Immutable: return original, never overwrite
      return existing;
    }
    this.byId.set(record.recordId, record);
    return record;
  }

  async get(
    recordId: string,
    organizationId: string
  ): Promise<EvaluationLedgerRecord | undefined> {
    const r = this.byId.get(recordId);
    if (!r || r.organizationId !== organizationId) return undefined;
    return r;
  }

  async listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly EvaluationLedgerRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.executionId === executionId && r.organizationId === organizationId
    );
  }
}
