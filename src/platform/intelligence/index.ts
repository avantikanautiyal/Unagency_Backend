/**
 * UNAGENCY Intelligence Platform
 *
 * M1.1–M1.7, M2.1–M2.4, M3.1–M3.2 frozen.
 * M3.3 Learning Intelligence Platform implemented.
 */

export * as shared from "./shared";
export * as config from "./config";
export * as events from "./events";
export * as security from "./security";
export * as telemetry from "./telemetry";
export * as kernel from "./kernel";
export * as runtime from "./runtime";
export * as policies from "./policies";
export * as scheduler from "./scheduler";
export * as capabilityRegistry from "./capability-registry";
export * as capabilityCatalog from "./capability-catalog";
export * as providers from "./providers";
/** @deprecated Prefer `providers` */
export * as providerCapabilityMatrix from "./provider-capability-matrix";
export * as executionPlanning from "./execution-planning";
/** @deprecated Prefer `executionPlanning` */
export * as executionPlanner from "./execution-planner";
export * as executionRuntime from "./execution-runtime";
export * as orchestrator from "./orchestrator";
export * as gateway from "./gateway";
export * as context from "./context";
export * as knowledge from "./knowledge";
export * as promptCompiler from "./prompt-compiler";
export * as memory from "./memory";
export * as evaluation from "./evaluation";
export * as artifacts from "./artifacts";
export * as learning from "./learning";
export * as cli from "./cli";
export * as playground from "./playground";
export * as testing from "./testing";

export {
  bootstrapIntelligencePlatform,
  getActiveKernel,
  shutdownIntelligencePlatform,
} from "./kernel";

export {
  bootstrapIntelligenceGateway,
  shutdownIntelligenceGateway,
  createIntelligencePlatform,
  getActiveIntelligencePlatform,
} from "./gateway";

export type { IPlatformKernel, IIntelligenceKernel } from "./kernel";
export type { IntelligencePlatformConfig } from "./config";
export type {
  IExecutionPlanningEngine,
  ExecutionPlan,
  CapabilityRequest,
} from "./execution-planning";
export type {
  IExecutionRuntime,
  IExecutionSession,
  ExecutionSnapshot,
} from "./execution-runtime";
export type {
  IIntelligenceOrchestrator,
  OrchestrationResult,
} from "./orchestrator";
export type {
  IIntelligenceGateway,
  GatewayCapabilityRequest,
  GatewayCapabilityResponse,
  IntelligencePlatform,
} from "./gateway";
export type {
  IContextIntelligenceEngine,
  IntelligenceContext,
  ContextSnapshot,
  ContextBuildRequest,
} from "./context";
export type {
  IKnowledgeIntelligenceEngine,
  KnowledgeRequest,
  KnowledgeSnapshot,
  KnowledgeResult,
} from "./knowledge";
export type {
  IPromptCompiler,
  PromptCompilationRequest,
  CompiledPrompt,
  PromptCompilationResult,
} from "./prompt-compiler";
export type {
  IMemoryIntelligenceEngine,
  MemoryRequest,
  MemorySnapshot,
  MemoryResult,
} from "./memory";
export type {
  IIntelligenceEvaluationEngine,
  EvaluationRequest,
  EvaluationReport,
  EvaluationResult,
  ConfidenceReport,
  ReviewDecision,
} from "./evaluation";
export type {
  IArtifactEngine,
  Artifact,
  ArtifactInput,
  ArtifactResult,
  ArtifactSnapshot,
  ArtifactType,
  ArtifactCollection,
} from "./artifacts";
export type {
  ILearningIntelligenceEngine,
  LearningRequest,
  LearningResult,
  LearningSignal,
  LearningRecommendation,
  LearningPattern,
  LearningSummary,
} from "./learning";
export type {
  ICapabilityRegistry,
  CapabilityDefinition,
} from "./capability-registry";
export type { ICapabilityCatalog } from "./capability-catalog";
export type {
  IProviderRegistry,
  IProviderFactory,
  IProviderAdapter,
  IProviderCapabilityMatrix,
  ProviderDefinition,
  ProviderCapabilityProfile,
} from "./providers";
