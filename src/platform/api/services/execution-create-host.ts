/**
 * Ports for extracted create / stream execution paths.
 * Maps and engines stay owned by ExecutionApiService; phases receive this host.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  AuthPrincipal,
  CreateExecutionRequest,
  ExecutionArtifactRef,
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionResource,
  ExecutionTraceSummary,
} from "../contracts";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import type { IStreamingService } from "../interfaces";
import type { ExecutionIntelligenceSnapshot } from "../execution-intelligence";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import type {
  BrandContext,
  ExecutionPlan,
  GovernanceDecision,
  GovernanceFinalizeService,
  KnowledgeContext,
  OsDeliveryService,
  OsLifecycleState,
  StructuredBrief,
  TaskGraphRunSnapshot,
} from "../../os";
import type { IBrandBrainEngine } from "../../business/brand-brain/interfaces";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  IIdempotencyStore,
  ITenantUsageStore,
} from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { AsyncExecutionCoordinator } from "../../intelligence/providers/async/coordination/async-execution-coordinator";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import type { ToolRuntimePlatform } from "../../intelligence/providers/tools/composition/tool-runtime-platform";
import type { CanonicalStreamHandoff } from "./canonical-execution-spine";
import type { WorkflowFollowUpPayload } from "./workflow-follow-up";
import type { PromptSignals } from "../../business/brand-brain/learning/prompt-signal-learner";

export const EXECUTION_MAX_PROMPT_CHARS = 100_000;
export const EXECUTION_MAX_METADATA_BYTES = 65_536;

export type ExecutionExtrasRecord = {
  diagnostics: ExecutionDiagnostics;
  trace: ExecutionTraceSummary;
  cost: ExecutionCostSummary;
  evaluation: ExecutionEvaluationSummary;
  experience: ExecutionExperienceSummary;
  osLifecycle?: OsLifecycleState;
  governance?: GovernanceDecision;
  asyncLane?: unknown;
  structuredBrief?: StructuredBrief;
  structuredBrandContext?: BrandContext;
  structuredKnowledgeContext?: KnowledgeContext;
  structuredExecutionPlan?: ExecutionPlan;
  structuredTaskGraphState?: TaskGraphRunSnapshot;
  workflowFollowUp?: WorkflowFollowUpPayload;
  pendingHumanReview?: {
    readonly reviewId: string;
    readonly reason: string;
    readonly requestedAt: string;
  };
  autoDelivery?: {
    readonly deliveryId?: string;
    readonly error?: string;
  };
};

export type ExecutionServiceDeps = {
  nowIso: () => string;
  createId: (prefix: string) => string;
  clockMs: () => number;
  distributed?: IDistributedExecutionEngine;
  integration?: IIntelligenceOsIntegrationEngine;
  streaming?: IStreamingService;
  autoTick?: boolean;
  onIntelligenceSnapshot?: (snapshot: ExecutionIntelligenceSnapshot) => void;
  executionMode?: EnterpriseApiExecutionMode;
  persistence?: {
    executions: IExecutionRepository;
    artifacts: IArtifactRepository;
    extras: IExecutionExtrasRepository;
    idempotency: IIdempotencyStore;
    tenantUsage: ITenantUsageStore;
  };
  asyncCoordinator?: AsyncExecutionCoordinator;
  asyncMedia?: AsyncMediaPlatform;
  videoRouter?: import("../../intelligence/providers/video/routing/video-execution-router").VideoExecutionRouter;
  imageRouter?: import("../../intelligence/providers/image/routing/image-execution-router").ImageExecutionRouter;
  audioRouter?: import("../../intelligence/providers/audio/routing/audio-execution-router").AudioExecutionRouter;
  textRouter?: import("../../intelligence/providers/routing/text/text-execution-router").TextExecutionRouter;
  toolRuntime?: ToolRuntimePlatform;
  nativeStreamDispatchers?: ReadonlyMap<
    string,
    import("../../intelligence/providers/streaming/interfaces/native-streaming-dispatcher").INativeStreamingDispatcher
  >;
};

export type ExecutionCreateHost = {
  readonly deps: ExecutionServiceDeps;
  readonly executionStore: Map<string, ExecutionResource>;
  readonly artifactStore: Map<string, ExecutionArtifactRef[]>;
  readonly idempotencyIndex: Map<string, { fingerprint: string; executionId: string }>;
  readonly tenantTokenUsage: Map<string, number>;
  readonly extrasStore: Map<string, ExecutionExtrasRecord>;
  readonly briefIntelligence: ReturnType<
    typeof import("../../os").createBriefIntelligenceEngine
  >;
  readonly brandIntelligence: ReturnType<
    typeof import("../../os").createBrandIntelligenceEngine
  >;
  readonly knowledgeIntelligence: ReturnType<
    typeof import("../../os").createKnowledgeIntelligenceOsEngine
  >;
  readonly executionIntelligence: ReturnType<
    typeof import("../../os").createExecutionIntelligenceOsEngine
  >;
  readonly briefByExecutionId: Map<string, StructuredBrief>;
  readonly brandByExecutionId: Map<string, BrandContext>;
  readonly knowledgeByExecutionId: Map<string, KnowledgeContext>;
  readonly planByExecutionId: Map<string, ExecutionPlan>;
  readonly streamHandoffByExecutionId: Map<string, CanonicalStreamHandoff>;
  readonly brandBrainEngine?: IBrandBrainEngine;
  readonly governanceFinalize: GovernanceFinalizeService;
  readonly deliveryService: OsDeliveryService;
  intelligenceGateway?: import("../../intelligence/gateway/interfaces/intelligence-gateway").IIntelligenceGateway;
  loadExecution(executionId: string): Promise<ExecutionResource | undefined>;
};
