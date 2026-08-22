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

export type ExecutionHistoryQuery = {
  limit?: number;
  offset?: number;
  page?: number;
  status?: string;
  q?: string;
  sort?: "newest" | "oldest";
  pinned?: boolean;
  favorite?: boolean;
  includeDeleted?: boolean;
};

export type ExecutionHistoryPage = {
  items: readonly ExecutionResource[];
  page: number;
  limit: number;
  total: number;
};

export interface IExecutionRepository {
  save(execution: ExecutionResource): Promise<void>;
  get(executionId: string): Promise<ExecutionResource | undefined>;
  listByTenant(
    organizationId: string,
    query?: ExecutionHistoryQuery | number
  ): Promise<ExecutionHistoryPage>;
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
      /** Phase 0 OS spine fields — optional for backward compatibility. */
      osLifecycle?: string;
      governance?: unknown;
      asyncLane?: unknown;
      /** Phase 1 StructuredBrief — tenant-scoped via organizationId on save. */
      structuredBrief?: unknown;
      /** Phase 2 BrandContext — tenant-scoped via organizationId on save. */
      structuredBrandContext?: unknown;
      /** Phase 3 KnowledgeContext — tenant-scoped via organizationId on save. */
      structuredKnowledgeContext?: unknown;
      /** Phase 4 ExecutionPlan — tenant-scoped via organizationId on save. */
      structuredExecutionPlan?: unknown;
      /** Phase 5 TaskGraphRunSnapshot — tenant-scoped via organizationId on save. */
      structuredTaskGraphState?: unknown;
      workflowFollowUp?: unknown;
      pendingHumanReview?: unknown;
      autoDelivery?: unknown;
    }
  ): Promise<void>;
  get(executionId: string): Promise<
    | {
        diagnostics: ExecutionDiagnostics;
        trace: ExecutionTraceSummary;
        cost: ExecutionCostSummary;
        evaluation: ExecutionEvaluationSummary;
        experience: ExecutionExperienceSummary;
        osLifecycle?: string;
        governance?: unknown;
        asyncLane?: unknown;
        structuredBrief?: unknown;
        structuredBrandContext?: unknown;
        structuredKnowledgeContext?: unknown;
        structuredExecutionPlan?: unknown;
        structuredTaskGraphState?: unknown;
        workflowFollowUp?: unknown;
        pendingHumanReview?: unknown;
        autoDelivery?: unknown;
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
