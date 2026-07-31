/**
 * Enterprise execution persistence ports.
 */

import type {
  ExecutionArtifactRef,
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionResource,
  ExecutionTraceSummary,
} from "../../../api/contracts";

export interface IExecutionRepository {
  save(execution: ExecutionResource): Promise<void>;
  get(executionId: string): Promise<ExecutionResource | undefined>;
  listByTenant(organizationId: string, limit?: number): Promise<readonly ExecutionResource[]>;
  update(execution: ExecutionResource): Promise<void>;
}

export interface IArtifactRepository {
  save(
    executionId: string,
    organizationId: string,
    artifacts: readonly ExecutionArtifactRef[]
  ): Promise<void>;
  list(executionId: string): Promise<readonly ExecutionArtifactRef[]>;
  get(artifactId: string): Promise<
    | { artifact: ExecutionArtifactRef; organizationId: string; executionId: string }
    | undefined
  >;
}

export interface IExecutionExtrasRepository {
  save(
    executionId: string,
    organizationId: string,
    extras: {
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
    }
  ): Promise<void>;
  get(executionId: string): Promise<
    | {
        diagnostics: ExecutionDiagnostics;
        trace: ExecutionTraceSummary;
        cost: ExecutionCostSummary;
        evaluation: ExecutionEvaluationSummary;
        experience: ExecutionExperienceSummary;
      }
    | undefined
  >;
}

export interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly executionId: string;
}

export interface IIdempotencyStore {
  get(tenantScopedKey: string): Promise<IdempotencyRecord | undefined>;
  set(tenantScopedKey: string, record: IdempotencyRecord, ttlSeconds?: number): Promise<void>;
  /** When durable mode requires Redis and store is unavailable. */
  isAvailable(): boolean;
}

export interface ITenantUsageStore {
  getTokensUsed(organizationId: string): Promise<number>;
  addTokens(organizationId: string, tokens: number): Promise<number>;
  isAvailable(): boolean;
}
