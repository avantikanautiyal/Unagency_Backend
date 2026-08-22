/**
 * Future OS layer ports — contracts only.
 * Implementations may be partial or absent; callers must check OsLayerImplementationStatus.
 */

import type { OsLayerImplementationStatus } from "./layer-status";

export interface OsTenantContext {
  readonly organizationId: string;
  readonly userId?: string;
  readonly requestId: string;
  readonly executionId: string;
  readonly workspaceId?: string;
  readonly correlationId?: string;
}

/** Brief Intelligence — Phase 1: implemented (deterministic extractor) */
export interface IBriefIntelligence {
  readonly implementationStatus: OsLayerImplementationStatus;
  createBrief(input: {
    readonly tenant: OsTenantContext;
    readonly rawPrompt: string;
    readonly clientCapabilityId?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }): import("../brief/contracts/structured-brief").StructuredBrief;
}

/** Brand Intelligence — Phase 2: implemented (structured BrandContext) */
export interface IBrandIntelligence {
  readonly implementationStatus: OsLayerImplementationStatus;
  getContext(input: {
    readonly organizationId: string;
    readonly brandId?: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly taskKind?: string;
    readonly capabilityId?: string;
    readonly briefIntent?: string;
  }): Promise<import("../brand/contracts/brand-context").BrandContext>;
}

/** Knowledge Intelligence — Phase 3: implemented (structured KnowledgeContext) */
export interface IKnowledgeIntelligence {
  readonly implementationStatus: OsLayerImplementationStatus;
  getContext(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly rawPrompt: string;
    readonly brandId?: string;
    readonly briefIntent?: string;
    readonly capabilityId?: string;
  }): Promise<import("../knowledge/contracts/knowledge-context").KnowledgeContext>;
}

/** Execution Intelligence — Phase 4: implemented (deterministic ExecutionPlan) */
export interface IExecutionIntelligence {
  readonly implementationStatus: OsLayerImplementationStatus;
  createPlan(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly brief: import("../brief/contracts/structured-brief").StructuredBrief;
    readonly brandContext?: import("../brand/contracts/brand-context").BrandContext;
    readonly knowledgeContext?: import("../knowledge/contracts/knowledge-context").KnowledgeContext;
  }): import("../execution-intelligence/contracts/execution-plan").ExecutionPlan;
  replan(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly brief: import("../brief/contracts/structured-brief").StructuredBrief;
    readonly brandContext?: import("../brand/contracts/brand-context").BrandContext;
    readonly knowledgeContext?: import("../knowledge/contracts/knowledge-context").KnowledgeContext;
    readonly forceReplan: true;
    readonly replanReason: string;
    readonly existingPlanVersion?: number;
  }): import("../execution-intelligence/contracts/execution-plan").ExecutionPlan;
}

/**
 * Canonical orchestrator authority for production HTTP executions.
 * Phase 0: IntegrationPipeline / IntelligenceOsIntegrationEngine fills this role
 * for single-execution coordination. IntelligenceOrchestrator (Kernel stack) is
 * NOT the production HTTP orchestrator.
 */
export interface ICanonicalOsOrchestrator {
  readonly implementationStatus: OsLayerImplementationStatus;
  readonly authority: "integration_pipeline";
}

/** Multi-task graph executor — Phase 5: implemented */
export interface ITaskGraphExecutor {
  readonly implementationStatus: OsLayerImplementationStatus;
  execute(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: import("../execution-intelligence/contracts/execution-plan").ExecutionPlan;
    readonly briefObjective?: string;
    readonly brandTone?: string;
    readonly knowledgeFactSummary?: string;
    readonly maxConcurrency?: number;
  }): Promise<
    import("../task-graph-executor/contracts/task-graph-state").TaskGraphRunSnapshot
  >;
  resume(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: import("../execution-intelligence/contracts/execution-plan").ExecutionPlan;
  }): Promise<
    import("../task-graph-executor/contracts/task-graph-state").TaskGraphRunSnapshot
  >;
  cancel(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly reason?: string;
  }): Promise<
    import("../task-graph-executor/contracts/task-graph-state").TaskGraphRunSnapshot
  >;
  getStatus(input: {
    readonly organizationId: string;
    readonly executionId: string;
  }): Promise<
    | import("../task-graph-executor/contracts/task-graph-state").TaskGraphRunSnapshot
    | undefined
  >;
}

export interface IOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus;
  getContract(capabilityId: string):
    | {
        readonly capabilityId: string;
        readonly inputSchemaRef?: string;
        readonly outputSchemaRef?: string;
        readonly requiredArtifacts?: readonly string[];
        readonly status: OsLayerImplementationStatus;
      }
    | undefined;
}

export interface IBrandGuard {
  readonly implementationStatus: "implemented";
}

export interface ISpecGuard {
  readonly implementationStatus: "implemented";
}

export interface IApprovalService {
  readonly implementationStatus: "implemented";
}

export interface IDeliveryService {
  readonly implementationStatus: "implemented";
}

export interface IRefinementEngine {
  readonly implementationStatus: "implemented";
}

export interface IAuditService {
  readonly implementationStatus: OsLayerImplementationStatus;
}
