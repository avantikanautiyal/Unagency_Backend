/**
 * Ports for extracted create / stream execution paths.
 * Direct provider path only — no OS intelligence layer assembly.
 */

import type { Result } from "../../core/result";
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
import type { IDirectExecutionEngine } from "../../direct/contracts";
import type { IStreamingService } from "../interfaces";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import type {
  GovernanceDecision,
  GovernanceFinalizeService,
  OsDeliveryService,
  OsLifecycleState,
} from "../../os";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  IIdempotencyStore,
  ITenantUsageStore,
} from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { AsyncExecutionCoordinator } from "../../providers/async/coordination/async-execution-coordinator";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import type { ToolRuntimePlatform } from "../../providers/tools/composition/tool-runtime-platform";
import type { CanonicalStreamHandoff } from "./canonical-execution-spine";
import type { WorkflowFollowUpPayload } from "./workflow-follow-up";
import type { AdaptiveRoutingDecisionServiceDeps } from "../../providers/routing/performance/benchmark/adaptive/adaptive-routing-decision-service";

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
  /** Track A — bound packet snapshot for refine reuse / packs / post-guards. */
  continuitySnapshot?: unknown;
  continuityPostGuards?: unknown;
  packPlan?: unknown;
  packPlanShadow?: unknown;
  continuityPack?: boolean;
  continuityObservability?: unknown;
  /** P4.9.5 — immutable create metadata for retry/duplicate continuation. */
  createMetadataSnapshot?: Readonly<Record<string, unknown>>;
  executionSpecSnapshot?: unknown;
};

export type ExecutionServiceDeps = {
  nowIso: () => string;
  createId: (prefix: string) => string;
  clockMs: () => number;
  distributed?: IDistributedExecutionEngine;
  integration?: IDirectExecutionEngine;
  streaming?: IStreamingService;
  autoTick?: boolean;
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
  videoRouter?: import("../../providers/video/routing/video-execution-router").VideoExecutionRouter;
  imageRouter?: import("../../providers/image/routing/image-execution-router").ImageExecutionRouter;
  /** LIVE provider registry — used for best-effort slide/hero image.generate. */
  providerRuntimeRegistry?: import("../../providers/runtime/registry/in-memory-provider-runtime-registry").IProviderRuntimeRegistry;
  audioRouter?: import("../../providers/audio/routing/audio-execution-router").AudioExecutionRouter;
  textRouter?: import("../../providers/routing/text/text-execution-router").TextExecutionRouter;
  toolRuntime?: ToolRuntimePlatform;
  nativeStreamDispatchers?: ReadonlyMap<
    string,
    import("../../providers/streaming/interfaces/native-streaming-dispatcher").INativeStreamingDispatcher
  >;
  /** Step 13 — adaptive routing decision deps (optional; static routing when absent). */
  adaptiveRouting?: AdaptiveRoutingDecisionServiceDeps;
};

export type ExecutionCreateHost = {
  readonly deps: ExecutionServiceDeps;
  readonly executionStore: Map<string, ExecutionResource>;
  readonly artifactStore: Map<string, ExecutionArtifactRef[]>;
  readonly idempotencyIndex: Map<string, { fingerprint: string; executionId: string }>;
  readonly tenantTokenUsage: Map<string, number>;
  readonly extrasStore: Map<string, ExecutionExtrasRecord>;
  readonly streamHandoffByExecutionId: Map<string, CanonicalStreamHandoff>;
  readonly governanceFinalize: GovernanceFinalizeService;
  readonly deliveryService: OsDeliveryService;
  loadExecution(executionId: string): Promise<ExecutionResource | undefined>;
  /** P4.9.5 — persisted create metadata + executionSpec for retry inheritance. */
  loadExecutionCreateMetadata?(
    executionId: string,
  ): Promise<Readonly<Record<string, unknown>> | undefined>;
  /** Optional distributed job metadata for continuation handoff. */
  loadExecutionJobMetadata?(
    executionId: string,
  ): Promise<Readonly<Record<string, unknown>> | undefined>;
};
