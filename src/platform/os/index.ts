/**
 * Production OS — refinement, delivery, governance, evaluation (direct provider execution).
 */

export * from "./contracts/layer-status";
export * from "./contracts/layer-ports";
export * from "./contracts/execution";
export * from "./contracts/product-mode";
export * from "./contracts/output-contract-registry";
export * from "./creative";
export * from "./lifecycle/states";
export * from "./governance/types";
export * from "./governance";
export * from "./evaluation";
export * from "./composition/create-production-negotiation";
export * from "./composition/assert-production-composition";
export * from "./composition/async-execution-boundary";
export * from "./observability/execution-log";
export * from "./refinement";
export * from "./delivery";
export * from "./runtime/contracts/os-work-job";
export * from "./runtime/queues/in-memory-os-work-queue";
export * from "./runtime/os-production-runtime";
export * from "./runtime/os-production-worker";

export {
  classifyServiceContext,
  extractUserBriefForServiceContext,
  type ServiceContextClassification,
  type ServiceContextWorkflow,
  type ServiceContextWorkflowPhase,
} from "../config/service-context-classifier";

export const CANONICAL_PRODUCTION_OS_SPINE = Object.freeze({
  version: "direct.1",
  authority: "direct_provider",
  path: [
    "EnterpriseGateway",
    "ExecutionApiService",
    "DirectExecutionEngine",
    "ProviderRuntime",
    "GovernanceEngine",
    "Refinement",
    "Delivery",
  ] as const,
  /**
   * Track A continuity layers sit *around* this spine when flagged on.
   * They are not part of the default hot path until A1–A2 exit.
   */
  continuityPlane: [
    "IntentGate",
    "KnowledgeResolver",
    "ContextBinder",
    "BrandMemoryPlane",
    "PostGuards",
    "ApprovePromote",
    "MultiDeliverableOrchestrator",
    "BriefAssist",
    "CampaignMemory",
    "ProductIntelligenceUx",
  ] as const,
});
