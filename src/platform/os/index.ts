/**
 * UNAGENCY Production OS — Phase 0 spine contracts & composition helpers.
 *
 * Canonical HTTP production path:
 *   Enterprise Gateway → ExecutionApiService → IntegrationPipeline → Provider Runtime
 *
 * Kernel / IntelligenceGateway / IntelligenceOrchestrator are infrastructure /
 * parallel control-plane stacks — NOT the production HTTP orchestrator.
 */

export * from "./contracts/layer-status";
export * from "./contracts/layer-ports";
export * from "./contracts/execution";
export * from "./contracts/product-mode";
export * from "./contracts/output-contract-registry";
export * from "./lifecycle/states";
export * from "./governance/types";
export * from "./governance";
export * from "./evaluation";
export * from "./composition/create-production-negotiation";
export * from "./composition/assert-production-composition";
export * from "./composition/async-execution-boundary";
export * from "./observability/execution-log";
export * from "./observability/brand-knowledge-context-log";
export * from "./brief";
export * from "./brand";
export * from "./knowledge";
export * from "./execution-intelligence";
export * from "./task-graph-executor";
export * from "./refinement";
export * from "./delivery";
export * from "./runtime/contracts/os-work-job";
export * from "./runtime/queues/in-memory-os-work-queue";
export * from "./runtime/os-production-runtime";

export const CANONICAL_PRODUCTION_OS_SPINE = Object.freeze({
  version: "phase8",
  authority: "integration_pipeline",
  path: [
    "EnterpriseGateway",
    "ExecutionApiService",
    "BriefIntelligence",
    "StructuredBrief",
    "BrandIntelligence",
    "BrandContext",
    "KnowledgeIntelligence",
    "KnowledgeContext",
    "ExecutionIntelligence",
    "ExecutionPlan",
    "TaskGraphExecutor",
    "EvaluationEngine",
    "GovernanceEngine",
    "Approval",
    "Refinement",
    "ArtifactVersioning",
    "Delivery",
    "DurableState",
    "OsWorkQueue",
    "CanonicalOsExecutionEntry",
    "IntegrationPipeline",
    "CapabilityRegistry",
    "ModelRouter",
    "ExecutionRuntime",
  ] as const,
  nonProductionStacks: [
    "IntelligenceKernel",
    "IntelligenceGateway",
    "IntelligenceOrchestrator",
  ] as const,
});
