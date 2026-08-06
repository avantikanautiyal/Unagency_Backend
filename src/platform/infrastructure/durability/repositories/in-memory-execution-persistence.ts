/**
 * Shared in-memory execution persistence — for tests and non-durable dev mode.
 */

import type { ExecutionResource } from "../../../api/contracts";
import type {
  ExecutionArtifactRef,
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionTraceSummary,
} from "../../../api/contracts";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  ExecutionHistoryPage,
  ExecutionHistoryQuery,
  IdempotencyRecord,
  IIdempotencyStore,
  ITenantUsageStore,
} from "../interfaces/execution-store-ports";
import { applyExecutionHistoryQuery } from "./execution-history-list";

export class InMemoryExecutionRepository implements IExecutionRepository {
  private readonly store = new Map<string, ExecutionResource>();

  async save(execution: ExecutionResource): Promise<void> {
    this.store.set(execution.executionId, execution);
  }

  async get(executionId: string): Promise<ExecutionResource | undefined> {
    return this.store.get(executionId);
  }

  async listByTenant(
    organizationId: string,
    queryOrLimit?: ExecutionHistoryQuery | number
  ): Promise<ExecutionHistoryPage> {
    return applyExecutionHistoryQuery(
      [...this.store.values()],
      organizationId,
      queryOrLimit
    );
  }

  async update(execution: ExecutionResource): Promise<void> {
    this.store.set(execution.executionId, execution);
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryArtifactRepository implements IArtifactRepository {
  private readonly byExecution = new Map<string, ExecutionArtifactRef[]>();
  private readonly byId = new Map<
    string,
    { artifact: ExecutionArtifactRef; organizationId: string; executionId: string }
  >();

  async save(
    executionId: string,
    organizationId: string,
    artifacts: readonly ExecutionArtifactRef[]
  ): Promise<void> {
    this.byExecution.set(executionId, [...artifacts]);
    for (const a of artifacts) {
      this.byId.set(a.artifactId, { artifact: a, organizationId, executionId });
    }
  }

  async list(executionId: string): Promise<readonly ExecutionArtifactRef[]> {
    return this.byExecution.get(executionId) ?? [];
  }

  async get(artifactId: string) {
    return this.byId.get(artifactId);
  }

  clear(): void {
    this.byExecution.clear();
    this.byId.clear();
  }
}

export class InMemoryExecutionExtrasRepository implements IExecutionExtrasRepository {
  private readonly store = new Map<
    string,
    {
      organizationId: string;
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
    }
  >();

  async save(
    executionId: string,
    organizationId: string,
    extras: {
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
    }
  ): Promise<void> {
    this.store.set(executionId, { organizationId, ...extras });
  }

  async get(executionId: string) {
    const row = this.store.get(executionId);
    if (!row) return undefined;
    const { diagnostics, trace, cost, evaluation, experience } = row;
    return { diagnostics, trace, cost, evaluation, experience };
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryIdempotencyStore implements IIdempotencyStore {
  private readonly store = new Map<string, IdempotencyRecord>();

  isAvailable(): boolean {
    return true;
  }

  async get(tenantScopedKey: string): Promise<IdempotencyRecord | undefined> {
    return this.store.get(tenantScopedKey);
  }

  async set(tenantScopedKey: string, record: IdempotencyRecord): Promise<void> {
    this.store.set(tenantScopedKey, record);
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryTenantUsageStore implements ITenantUsageStore {
  private readonly usage = new Map<string, number>();

  isAvailable(): boolean {
    return true;
  }

  async getTokensUsed(organizationId: string): Promise<number> {
    return this.usage.get(organizationId) ?? 0;
  }

  async addTokens(organizationId: string, tokens: number): Promise<number> {
    const next = (this.usage.get(organizationId) ?? 0) + tokens;
    this.usage.set(organizationId, next);
    return next;
  }

  clear(): void {
    this.usage.clear();
  }
}
