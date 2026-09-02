/**
 * Execution API service — bridges Distributed Execution + DirectExecutionEngine.
 * Never exposes Runtime/Routing/Providers to clients.
 * Legacy "Integration Layer" naming means the direct provider spine.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError, NotFoundError, AuthorizationError } from "../../core/errors";
import { resolveControlPlaneWorkspaceId } from "./integration-control-plane-runner";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import { asJobId } from "../../infrastructure/execution/contracts/job";
import type { IDirectExecutionEngine } from "../../direct/contracts";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
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
  TenantContext,
} from "../contracts";
import type { IExecutionApiService, IStreamingService } from "../interfaces";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import {
  defaultAsyncExecutionBoundary,
  osLifecycleFromApiStatus,
  createProductionNegotiationPlatform,
  createGovernanceFinalizeService,
  createRefinementEngine,
  createOsDeliveryService,
  type GovernanceDecision,
  type OsLifecycleState,
  type GovernanceFinalizeService,
  type RefinementEngine,
  type OsDeliveryService,
} from "../../os";
import { RefinementError } from "../../os/refinement/contracts/errors";
import { DeliveryError } from "../../os/delivery/contracts/errors";
import type { OsDurableBundle } from "../../infrastructure/durability/create-os-durable-bundle";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  IIdempotencyStore,
  ITenantUsageStore,
  ExecutionHistoryPage,
  ExecutionHistoryQuery,
} from "../../infrastructure/durability/interfaces/execution-store-ports";
import { applyExecutionHistoryQuery } from "../../infrastructure/durability/repositories/execution-history-list";
import type { AsyncExecutionCoordinator } from "../../providers/async/coordination/async-execution-coordinator";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  buildExecutionResultPayload,
  mergeExportArtifactsIntoResult,
} from "./execution-result-payload";
import { applyWebsiteExportToExecution } from "./website-export-materializer";
import { buildPendingApprovals } from "./tool-approval-presentation";
import {
  approveToolInvocation,
  type ToolRuntimePlatform,
} from "../../providers/tools/composition/tool-runtime-platform";
import type { LiveSseExecutionPayload } from "./execution-streaming-service";
import {
  CANONICAL_INTEGRATION_MODE,
  type CanonicalStreamHandoff,
} from "./canonical-execution-spine";
import { executeCanonicalStream } from "./execution-canonical-stream";
import { runCreateExecution } from "./execution-create-pipeline";
import type { ExecutionCreateHost, ExecutionExtrasRecord } from "./execution-create-host";
import {
  buildRefineContinuityMetadata,
  extractContinuitySnapshot,
} from "../../os/creative/refine-packet-continuity";
import { buildContinuityObservabilitySummary } from "../../os/creative/continuity-product-ux";
import { mapJobStatus } from "./execution-summary-helpers";
import type { WorkflowFollowUpPayload } from "./workflow-follow-up";



export class ExecutionApiService implements IExecutionApiService {
  private readonly executionStore = new Map<string, ExecutionResource>();
  private readonly artifactStore = new Map<string, ExecutionArtifactRef[]>();
  private readonly idempotencyIndex = new Map<
    string,
    { fingerprint: string; executionId: string }
  >();
  private readonly tenantTokenUsage = new Map<string, number>();
  private readonly extrasStore = new Map<
    string,
    {
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
      osLifecycle?: OsLifecycleState;
      governance?: GovernanceDecision;
      asyncLane?: ReturnType<typeof defaultAsyncExecutionBoundary.attachAsyncExecution>;
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
    }
  >();

  /** Stream handoff before provider streaming. */
  private readonly streamHandoffByExecutionId = new Map<string, CanonicalStreamHandoff>();
  private readonly governanceFinalize: GovernanceFinalizeService;
  private readonly refinementEngine: RefinementEngine;
  private readonly deliveryService: OsDeliveryService;
  private readonly productionCapabilityRegistry: import("../../capability-registry/interfaces/capability-registry").ICapabilityRegistry;
  private readonly osIdempotency = new Map<string, unknown>();

  constructor(
    private readonly deps: {
      nowIso: () => string;
      createId: (prefix: string) => string;
      clockMs: () => number;
      distributed?: IDistributedExecutionEngine;
      integration?: IDirectExecutionEngine;
      streaming?: IStreamingService;
      autoTick?: boolean;
      executionMode?: EnterpriseApiExecutionMode;
      capabilityRegistry?: import("../../capability-registry/interfaces/capability-registry").ICapabilityRegistry;
      osBundle?: OsDurableBundle;
      deliveryService?: OsDeliveryService;
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
      audioRouter?: import("../../providers/audio/routing/audio-execution-router").AudioExecutionRouter;
      textRouter?: import("../../providers/routing/text/text-execution-router").TextExecutionRouter;
      toolRuntime?: ToolRuntimePlatform;
      nativeStreamDispatchers?: ReadonlyMap<string, import("../../providers/streaming/interfaces/native-streaming-dispatcher").INativeStreamingDispatcher>;
      adaptiveRouting?: import("../../providers/routing/performance/benchmark/adaptive/adaptive-routing-decision-service").AdaptiveRoutingDecisionServiceDeps;
    }
  ) {
    this.productionCapabilityRegistry =
      deps.capabilityRegistry ??
      createProductionNegotiationPlatform({
        nowIso: deps.nowIso,
        createId: deps.createId,
      }).capabilityRegistry;
    this.governanceFinalize = createGovernanceFinalizeService({
      humanReviews: deps.osBundle?.humanReviews,
      evaluationLedger: deps.osBundle?.evaluations,
      governanceDecisions: deps.osBundle?.governance,
    });
    this.refinementEngine = createRefinementEngine({
      store: deps.osBundle?.refinements,
      feedbackStore: deps.osBundle?.feedbackSessions,
      integration: deps.integration,
      createId: deps.createId,
    });
    this.deliveryService =
      deps.deliveryService ??
      createOsDeliveryService({
        artifacts: deps.osBundle?.artifacts,
        receipts: deps.osBundle?.deliveries,
      });
  }

  async createStream(
    req: CreateExecutionRequest,
    principal: AuthPrincipal,
    tenant: TenantContext,
    abortSignal?: AbortSignal
  ): Promise<Result<LiveSseExecutionPayload>> {
    // Canonical spine: streaming reuses the same direct execution ingress as POST /v1/executions
    // (routing) before provider stream handoff.
    const handoffReq: CreateExecutionRequest = {
      ...req,
      metadata: {
        ...(req.metadata ?? {}),
        canonicalStreamHandoff: true,
      },
    };
    const prep = await this.create(handoffReq, principal);
    if (!prep.ok) return failure(prep.error);
    const handoff = this.streamHandoffByExecutionId.get(prep.value.executionId);
    if (!handoff) {
      return failure(
        new ValidationError("canonical stream handoff missing after direct execution ingress")
      );
    }
    this.streamHandoffByExecutionId.delete(prep.value.executionId);
    return this.executeCanonicalStream(handoff, abortSignal);
  }

  /**
   * Canonical streaming — direct execution ingress already applied via handoff;
   * run routing then hand off to live or simulated provider stream.
   */
  private async executeCanonicalStream(
    handoff: CanonicalStreamHandoff,
    abortSignal?: AbortSignal
  ): Promise<Result<LiveSseExecutionPayload>> {
    return executeCanonicalStream(this.asCreateHost(), handoff, abortSignal);
  }


  async create(
    req: CreateExecutionRequest,
    principal: AuthPrincipal
  ): Promise<Result<ExecutionResource>> {
    return runCreateExecution(this.asCreateHost(), req, principal);
  }


  async get(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>> {
    if (this.deps.asyncCoordinator) {
      await this.deps.asyncCoordinator.reconcileExecution(executionId);
    }
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const resource = await this.hydrateFromDistributedJob(got.value);
    if (!this.deps.toolRuntime) return success(resource);
    const records = await this.deps.toolRuntime.invocationStore.listByExecution(executionId);
    const awaiting = records.filter((record) => record.status === "awaiting_approval");
    const fromStore = buildPendingApprovals(awaiting);
    // M10.8 — stream path may persist pendingApprovals on the resource without tool-store rows yet.
    const pendingApprovals =
      fromStore.length > 0
        ? fromStore
        : resource.pendingApprovals ?? [];
    const approvalRequired =
      resource.status === "awaiting_approval" || pendingApprovals.length > 0;
    return success({
      ...resource,
      approvalRequired: approvalRequired || undefined,
      toolInvocationKey: pendingApprovals[0]?.invocationId ?? (
        approvalRequired ? resource.toolInvocationKey : undefined
      ),
      pendingApprovals: pendingApprovals.length ? pendingApprovals : undefined,
      result: approvalRequired
        ? {
            kind: "tool_approval_required",
            data: { pendingApprovals },
          }
        : resource.result,
    });
  }

  async decideToolApproval(
    executionId: string,
    invocationKey: string,
    decision: "approve" | "reject",
    principal: AuthPrincipal,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (!this.deps.toolRuntime) {
      return failure(new ValidationError("Tool runtime is not configured"));
    }
    const approved = await approveToolInvocation({
      platform: this.deps.toolRuntime,
      organizationId: tenant.organizationId,
      executionId,
      invocationKey,
      principal,
      decision,
    });
    if (!approved.ok) return approved;

    const resumed = approved.value.resumed?.providerResult;
    const awaitingMore = resumed?.error?.code === "TOOL_APPROVAL_REQUIRED";
    const status: ExecutionResource["status"] = awaitingMore
      ? "awaiting_approval"
      : resumed
        ? resumed.success
          ? "succeeded"
          : "failed"
        : decision === "reject"
          ? "failed"
          : got.value.status;

    const runtimeOutput = (resumed?.response?.output ?? {}) as Record<string, unknown>;
    const structuredFromOrch =
      typeof (runtimeOutput as { structured?: unknown }).structured !== "undefined"
        ? (runtimeOutput as { structured?: unknown }).structured
        : undefined;
    const jobSummary: Record<string, unknown> = {
      ...(structuredFromOrch != null ? { structuredData: structuredFromOrch } : {}),
      ...(typeof runtimeOutput.content === "string"
        ? { resultText: runtimeOutput.content }
        : typeof runtimeOutput.text === "string"
          ? { resultText: runtimeOutput.text }
          : typeof runtimeOutput.message === "string"
            ? { resultText: runtimeOutput.message }
            : {}),
    };

    const records = await this.deps.toolRuntime.invocationStore.listByExecution(
      executionId
    );
    const pendingApprovals = buildPendingApprovals(records);

    const result = awaitingMore
      ? ({
          kind: "tool_approval_required" as const,
          data: { pendingApprovals },
        })
      : buildExecutionResultPayload({
          status,
          jobSummary,
          runtimeOutput,
        });

    const updated: ExecutionResource = {
      ...got.value,
      status,
      approvalRequired: awaitingMore || undefined,
      toolInvocationKey: awaitingMore
        ? pendingApprovals[0]?.invocationId ?? invocationKey
        : undefined,
      pendingApprovals: awaitingMore ? pendingApprovals : undefined,
      result,
      errorMessage:
        decision === "reject" && !resumed?.success
          ? resumed?.error?.message ?? "Tool approval rejected"
          : resumed?.error?.message,
      updatedAt: this.deps.nowIso(),
      completedAt:
        status === "awaiting_approval" || status === "running"
          ? undefined
          : this.deps.nowIso(),
    };
    this.executionStore.set(executionId, updated);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(updated);
    }
    return success(updated);
  }

  async cancel(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const exec = got.value;
    if (exec.jobId && this.deps.distributed) {
      await this.deps.distributed.cancel(exec.jobId as never, "api_cancel");
    }
    const updated: ExecutionResource = {
      ...exec,
      status: "cancelled",
      updatedAt: this.deps.nowIso(),
      completedAt: this.deps.nowIso(),
    };
    this.executionStore.set(executionId, updated);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(updated);
    }
    return success(updated);
  }

  async retry(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    return this.create(
      {
        prompt: got.value.promptPreview,
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId ?? got.value.workspaceId,
        capabilityId: got.value.capabilityId,
        providerId: got.value.providerId,
        modelId: got.value.modelId,
        metadata: got.value.brandId
          ? { brandId: got.value.brandId, retriedFrom: executionId }
          : { retriedFrom: executionId },
      },
      {
        principalId: tenant.userId ?? "retry",
        kind: "user",
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        roles: ["member"],
        userId: tenant.userId,
      }
    );
  }

  async duplicate(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const src = got.value;
    return this.create(
      {
        prompt: src.promptPreview,
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId ?? src.workspaceId,
        capabilityId: src.capabilityId,
        providerId: src.providerId,
        modelId: src.modelId,
        metadata: {
          ...(src.brandId ? { brandId: src.brandId } : {}),
          duplicatedFrom: executionId,
        },
      },
      {
        principalId: tenant.userId ?? "duplicate",
        kind: "user",
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        roles: ["member"],
        userId: tenant.userId,
      }
    );
  }

  async softDelete(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const now = this.deps.nowIso();
    const updated: ExecutionResource = {
      ...got.value,
      deletedAt: now,
      updatedAt: now,
    };
    await this.persistExecution(updated);
    return success(updated);
  }

  async setPinned(
    executionId: string,
    tenant: TenantContext,
    pinned: boolean
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const updated: ExecutionResource = {
      ...got.value,
      pinned,
      updatedAt: this.deps.nowIso(),
    };
    await this.persistExecution(updated);
    return success(updated);
  }

  async setFavorite(
    executionId: string,
    tenant: TenantContext,
    favorite: boolean
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const updated: ExecutionResource = {
      ...got.value,
      favorite,
      updatedAt: this.deps.nowIso(),
    };
    await this.persistExecution(updated);
    return success(updated);
  }

  async history(
    tenant: TenantContext,
    query?: ExecutionHistoryQuery
  ): Promise<Result<ExecutionHistoryPage>> {
    if (this.deps.persistence) {
      const page = await this.deps.persistence.executions.listByTenant(
        tenant.organizationId,
        query
      );
      if (tenant.workspaceId) {
        return success({
          ...page,
          items: page.items.filter(
            (e) => !e.workspaceId || e.workspaceId === tenant.workspaceId
          ),
        });
      }
      return success(page);
    }
    const page = applyExecutionHistoryQuery(
      [...this.executionStore.values()],
      tenant.organizationId,
      query
    );
    const items = tenant.workspaceId
      ? page.items.filter(
          (e) => !e.workspaceId || e.workspaceId === tenant.workspaceId
        )
      : page.items;
    return success({ ...page, items, total: items.length });
  }

  async artifacts(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<readonly ExecutionArtifactRef[]>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      return success(await this.deps.persistence.artifacts.list(executionId));
    }
    return success(this.artifactStore.get(executionId) ?? []);
  }

  async diagnostics(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionDiagnostics>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const extras = this.deps.persistence
      ? await this.deps.persistence.extras.get(executionId)
      : this.extrasStore.get(executionId);
    if (!extras) return failure(new NotFoundError("diagnostics not found"));
    const continuity =
      extras.continuityObservability ??
      buildContinuityObservabilitySummary({ extras: extras as Record<string, unknown> });
    return success({
      ...extras.diagnostics,
      // A6 — admin/product observability (non-breaking additive field)
      continuityObservability: continuity,
    } as ExecutionDiagnostics);
  }

  async trace(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionTraceSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("trace not found"));
      return success(extras.trace);
    }
    return success(this.extrasStore.get(executionId)!.trace);
  }

  async cost(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionCostSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("cost not found"));
      return success(extras.cost);
    }
    return success(this.extrasStore.get(executionId)!.cost);
  }

  async evaluation(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionEvaluationSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("evaluation not found"));
      return success(extras.evaluation);
    }
    return success(this.extrasStore.get(executionId)!.evaluation);
  }

  async experience(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionExperienceSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("experience not found"));
      return success(extras.experience);
    }
    return success(this.extrasStore.get(executionId)!.experience);
  }

  async getWorkflowFollowUp(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<WorkflowFollowUpPayload | null>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const extras = this.deps.persistence
      ? await this.deps.persistence.extras.get(executionId)
      : this.extrasStore.get(executionId);
    const followUp = extras?.workflowFollowUp as WorkflowFollowUpPayload | undefined;
    if (!followUp || followUp.consumed) return success(null);
    return success(followUp);
  }

  async consumeWorkflowFollowUp(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<WorkflowFollowUpPayload | null>> {
    const got = await this.getWorkflowFollowUp(executionId, tenant);
    if (!got.ok) return got;
    if (!got.value) return success(null);
    const consumed: WorkflowFollowUpPayload = {
      ...got.value,
      consumed: true,
    };
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (extras) {
        await this.deps.persistence.extras.save(executionId, tenant.organizationId, {
          ...extras,
          workflowFollowUp: consumed,
        });
      }
    } else {
      const existing = this.extrasStore.get(executionId);
      if (existing) {
        this.extrasStore.set(executionId, {
          ...existing,
          workflowFollowUp: consumed,
        });
      }
    }
    return success(got.value);
  }

  /**
   * Phase 6 — submit human review decision (never auto-approves).
   */
  async submitHumanReviewDecision(
    executionId: string,
    tenant: TenantContext,
    input: {
      readonly reviewId: string;
      readonly decision: "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
      readonly reviewer: string;
      readonly comments?: string;
    }
  ): Promise<Result<{ readonly review: unknown; readonly singleCapability: true }>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;

    try {
      const review = await this.governanceFinalize.getHumanReviewStore().decide({
        reviewId: input.reviewId,
        organizationId: tenant.organizationId,
        decision: input.decision,
        reviewer: input.reviewer,
        comments: input.comments,
        nowIso: this.deps.nowIso,
      });
      const resource = got.value;
      const nextStatus =
        input.decision === "APPROVED"
          ? "succeeded"
          : input.decision === "REJECTED"
            ? "failed"
            : resource.status;
      const updated: ExecutionResource = {
        ...resource,
        status: nextStatus,
        updatedAt: this.deps.nowIso(),
        completedAt:
          input.decision === "REQUEST_CHANGES" ? undefined : this.deps.nowIso(),
        errorMessage:
          input.decision === "REJECTED"
            ? input.comments ?? "Rejected in human review"
            : resource.errorMessage,
      };
      this.executionStore.set(executionId, updated);
      if (this.deps.persistence) {
        await this.deps.persistence.executions.update(updated);
        const extras = await this.deps.persistence.extras.get(executionId);
        if (extras) {
          await this.deps.persistence.extras.save(executionId, tenant.organizationId, {
            ...extras,
            pendingHumanReview: undefined,
            osLifecycle: osLifecycleFromApiStatus(updated.status),
          });
        }
      } else {
        const local = this.extrasStore.get(executionId);
        if (local) {
          this.extrasStore.set(executionId, {
            ...local,
            pendingHumanReview: undefined,
            osLifecycle: osLifecycleFromApiStatus(updated.status),
          });
        }
      }
      return success({ review, singleCapability: true as const });
    } catch (err) {
      return failure(
        new ValidationError(
          err instanceof Error ? err.message : "human review decision failed"
        )
      );
    }
  }

  /** Phase 7 — domain access to structured refinement engine */
  getRefinementEngine(): RefinementEngine {
    return this.refinementEngine;
  }

  /** Phase 7 — domain access to approval-gated delivery */
  getDeliveryService(): OsDeliveryService {
    return this.deliveryService;
  }

  async getAutoDelivery(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<{ readonly deliveryId?: string; readonly error?: string } | null>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const extras = this.deps.persistence
      ? await this.deps.persistence.extras.get(executionId)
      : this.extrasStore.get(executionId);
    const autoDelivery = extras?.autoDelivery as
      | { deliveryId?: string; error?: string }
      | undefined;
    if (!autoDelivery) return success(null);
    return success(autoDelivery);
  }

  /** Expose the capability registry for provider negotiation. */
  getCapabilityRegistry(): import("../../capability-registry/interfaces/capability-registry").ICapabilityRegistry {
    return this.productionCapabilityRegistry;
  }


  private asCreateHost(): ExecutionCreateHost {
    return {
      deps: this.deps,
      executionStore: this.executionStore,
      artifactStore: this.artifactStore,
      idempotencyIndex: this.idempotencyIndex,
      tenantTokenUsage: this.tenantTokenUsage,
      extrasStore: this.extrasStore as Map<string, ExecutionExtrasRecord>,
      streamHandoffByExecutionId: this.streamHandoffByExecutionId,
      governanceFinalize: this.governanceFinalize,
      deliveryService: this.deliveryService,
      loadExecution: (executionId) => this.loadExecution(executionId),
    };
  }

  private async rememberOsIdempotent<T>(
    organizationId: string,
    key: string | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!key?.trim()) return fn();
    const k = `${organizationId}|${key.trim()}`;
    if (this.osIdempotency.has(k)) return this.osIdempotency.get(k) as T;
    if (this.deps.persistence?.idempotency.isAvailable()) {
      const hit = await this.deps.persistence.idempotency.get(k);
      if (hit) {
        try {
          return JSON.parse(String((hit as { executionId?: string }).executionId ?? "")) as T;
        } catch {
          /* fall through */
        }
      }
    }
    const value = await fn();
    this.osIdempotency.set(k, value);
    return value;
  }

  async requestOsRefinement(
    tenant: TenantContext,
    body: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Result<unknown>> {
    return this.rememberOsIdempotent(tenant.organizationId, idempotencyKey, async () => {
      try {
        const executionId = String(body.executionId ?? "");
        let brandId =
          typeof body.brandId === "string" && body.brandId.trim()
            ? body.brandId.trim()
            : undefined;
        // Fall back to brandId from the source execution metadata when FE omits it.
        if (!brandId && executionId) {
          try {
            const got = await this.get(executionId, tenant);
            if (
              got.ok &&
              typeof got.value.brandId === "string" &&
              got.value.brandId.trim()
            ) {
              brandId = got.value.brandId.trim();
            }
          } catch {
            // best-effort
          }
        }

        const result = await this.refinementEngine.requestRefinement({
          organizationId: tenant.organizationId,
          executionId,
          sourceOutputId: String(body.sourceOutputId ?? body.artifactId ?? ""),
          sourceVersion: Number(body.sourceVersion ?? 1),
          sourcePreview: body.sourcePreview ? String(body.sourcePreview) : undefined,
          mode: (body.mode as "AI" | "HYBRID") ?? "AI",
          outputType: body.outputType as never,
          outputContractId: body.outputContractId
            ? String(body.outputContractId)
            : undefined,
          productService: body.productService ? String(body.productService) : undefined,
          taskType: body.taskType ? String(body.taskType) : undefined,
          taskKey: body.taskKey ? String(body.taskKey) : undefined,
          planId: body.planId ? String(body.planId) : undefined,
          planVersion: body.planVersion != null ? Number(body.planVersion) : undefined,
          sourceApprovalStatus: body.sourceApprovalStatus
            ? String(body.sourceApprovalStatus)
            : "APPROVED",
          ...(brandId ? { brandId } : {}),
          nowIso: this.deps.nowIso,
          createId: this.deps.createId,
        });
        return success({
          refinementId: result.request.refinementId,
          status: result.request.status,
          organizationId: result.request.organizationId,
          executionId: result.request.executionId,
          question: result.presented,
          refinementVersion: result.request.refinementVersion,
          sourcePreview: result.request.sourcePreview,
        });
      } catch (err) {
        return this.mapOsError(err);
      }
    });
  }

  async getOsRefinement(
    refinementId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const req = await this.refinementEngine.getStore().get(
      refinementId,
      tenant.organizationId
    );
    if (!req) return failure(new NotFoundError("refinement not found"));
    return success({
      refinementId: req.refinementId,
      status: req.status,
      organizationId: req.organizationId,
      executionId: req.executionId,
      refinementVersion: req.refinementVersion,
      feedbackSessionId: req.feedbackSessionId,
      sourcePreview: req.sourcePreview,
    });
  }

  async getOsRefinementQuestion(
    refinementId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    try {
      const q = await this.refinementEngine.getNextQuestion({
        refinementId,
        organizationId: tenant.organizationId,
      });
      if (!q) return success({ question: null, complete: true });
      return success({ question: q, complete: false });
    } catch (err) {
      return this.mapOsError(err);
    }
  }

  async submitOsRefinementAnswer(
    refinementId: string,
    tenant: TenantContext,
    body: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Result<unknown>> {
    return this.rememberOsIdempotent(tenant.organizationId, idempotencyKey, async () => {
      try {
        const result = await this.refinementEngine.submitAnswer({
          refinementId,
          organizationId: tenant.organizationId,
          questionId: String(body.questionId ?? ""),
          optionIds: Array.isArray(body.optionIds)
            ? body.optionIds.map((x) => String(x))
            : [],
          otherText: body.otherText ? String(body.otherText) : undefined,
          nowIso: this.deps.nowIso,
        });
        return success({
          refinementId: result.request.refinementId,
          status: result.request.status,
          completed: result.completed,
          question: result.next ?? null,
          specificationId: result.specification?.specificationId,
        });
      } catch (err) {
        return this.mapOsError(err);
      }
    });
  }

  async completeOsRefinement(
    refinementId: string,
    tenant: TenantContext,
    idempotencyKey?: string
  ): Promise<Result<unknown>> {
    return this.rememberOsIdempotent(tenant.organizationId, idempotencyKey, async () => {
      try {
        const result = await this.refinementEngine.completeFeedback({
          refinementId,
          organizationId: tenant.organizationId,
          nowIso: this.deps.nowIso,
        });

        // Track A Phase A4 — return same-packet metadata for the next thin create.
        let continuityMetadata: Record<string, unknown> | undefined;
        try {
          const extras = this.deps.persistence
            ? await this.deps.persistence.extras.get(result.request.executionId)
            : this.extrasStore.get(result.request.executionId);
          const snap =
            extractContinuitySnapshot(
              extras as Readonly<Record<string, unknown>> | undefined
            ) ??
            (result.request.brandId
              ? {
                  brandId: result.request.brandId,
                  continuityBound: false as const,
                }
              : null);
          if (snap) {
            continuityMetadata = buildRefineContinuityMetadata({
              snapshot: snap,
              refinementId: result.request.refinementId,
              sourceExecutionId: result.request.executionId,
            });
          }
        } catch {
          // best-effort
        }

        return success({
          refinementId: result.request.refinementId,
          status: result.request.status,
          specificationId: result.specification.specificationId,
          refinementVersion: result.request.refinementVersion,
          sourcePreview: result.request.sourcePreview,
          ...(continuityMetadata
            ? {
                continuityMetadata,
                preserveBoundPacket: true,
              }
            : {}),
        });
      } catch (err) {
        return this.mapOsError(err);
      }
    });
  }

  async approveOsArtifactVersion(
    artifactId: string,
    version: number,
    tenant: TenantContext,
    body: Record<string, unknown>
  ): Promise<Result<unknown>> {
    try {
      const store = this.deliveryService.getArtifactStore();
      const brandMemoryRaw = body.brandMemory;
      const brandMemory =
        brandMemoryRaw &&
        typeof brandMemoryRaw === "object" &&
        !Array.isArray(brandMemoryRaw)
          ? (brandMemoryRaw as {
              brandId?: string;
              slotKey?: string;
              tier?: "canonical" | "working" | "archive";
              assetId?: string;
              facts?: Readonly<Record<string, string | readonly string[]>>;
              campaignId?: string;
              campaignTitle?: string;
              recordSelection?: boolean;
              service?: string;
            })
          : undefined;

      const approved = await store.approveVersion({
        artifactId,
        version,
        organizationId: tenant.organizationId,
        approvalReference: String(
          body.approvalReference ?? body.reference ?? `approve_${Date.now()}`
        ),
        nowIso: this.deps.nowIso,
        ...(brandMemory?.brandId?.trim() && brandMemory.slotKey
          ? {
              brandMemory: {
                brandId: brandMemory.brandId.trim(),
                slotKey: brandMemory.slotKey,
                tier: brandMemory.tier,
                assetId: brandMemory.assetId,
                facts: brandMemory.facts,
                campaignId: brandMemory.campaignId,
                campaignTitle: brandMemory.campaignTitle,
                recordSelection: brandMemory.recordSelection,
                service: brandMemory.service,
              },
            }
          : {}),
      });
      return success({
        ...this.toArtifactDto(approved),
        brandMemoryAttached: Boolean(brandMemory?.brandId?.trim()),
      });
    } catch (err) {
      return this.mapOsError(err);
    }
  }

  async getOsArtifact(
    artifactId: string,
    tenant: TenantContext,
    version?: number
  ): Promise<Result<unknown>> {
    const store = this.deliveryService.getArtifactStore();
    if (version != null) {
      const art = await store.getVersion(artifactId, version, tenant.organizationId);
      if (!art) return failure(new NotFoundError("artifact not found"));
      return success(this.toArtifactDto(art));
    }
    const list = await store.listVersions(artifactId, tenant.organizationId);
    const latest = list[list.length - 1];
    if (!latest) return failure(new NotFoundError("artifact not found"));
    return success(this.toArtifactDto(latest));
  }

  async listOsArtifactVersions(
    artifactId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const list = await this.deliveryService
      .getArtifactStore()
      .listVersions(artifactId, tenant.organizationId);
    return success(list.map((a) => this.toArtifactDto(a)));
  }

  async getOsManifest(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const manifest = await this.deliveryService
      .getArtifactStore()
      .getLatestManifest(executionId, tenant.organizationId);
    if (!manifest) return failure(new NotFoundError("manifest not found"));
    return success({
      manifestId: manifest.manifestId,
      organizationId: manifest.organizationId,
      executionId: manifest.executionId,
      version: manifest.version,
      entries: manifest.entries,
      planVersion: manifest.planVersion,
      createdAt: manifest.createdAt,
    });
  }

  async authorizeOsDelivery(
    tenant: TenantContext,
    body: Record<string, unknown>
  ): Promise<Result<unknown>> {
    try {
      const auth = await this.deliveryService.authorize({
        organizationId: tenant.organizationId,
        artifactId: String(body.artifactId ?? ""),
        artifactVersion: Number(body.artifactVersion ?? 0),
        executionId: String(body.executionId ?? ""),
        planVersion: body.planVersion != null ? Number(body.planVersion) : undefined,
        destination: (body.destination as never) ?? "export",
      });
      return success(auth);
    } catch (err) {
      return this.mapOsError(err);
    }
  }

  async createOsDelivery(
    tenant: TenantContext,
    body: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Result<unknown>> {
    return this.rememberOsIdempotent(tenant.organizationId, idempotencyKey, async () => {
      try {
        const receipt = await this.deliveryService.createDelivery({
          organizationId: tenant.organizationId,
          artifactId: String(body.artifactId ?? ""),
          artifactVersion: Number(body.artifactVersion ?? 0),
          executionId: String(body.executionId ?? ""),
          planVersion: body.planVersion != null ? Number(body.planVersion) : undefined,
          destination: (body.destination as never) ?? "export",
          deliveryIntent: body.deliveryIntent ? String(body.deliveryIntent) : undefined,
          nowIso: this.deps.nowIso,
          createId: this.deps.createId,
        });
        return success(this.toDeliveryDto(receipt));
      } catch (err) {
        return this.mapOsError(err);
      }
    });
  }

  async getOsDelivery(
    deliveryId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const r = await this.deliveryService.getDelivery(deliveryId, tenant.organizationId);
    if (!r) return failure(new NotFoundError("delivery not found"));
    return success(this.toDeliveryDto(r));
  }

  async cancelOsDelivery(
    deliveryId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const r = await this.deliveryService.cancelDelivery(
      deliveryId,
      tenant.organizationId,
      this.deps.nowIso
    );
    if (!r) return failure(new NotFoundError("delivery not found"));
    return success(this.toDeliveryDto(r));
  }

  async getOsReview(
    reviewId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const rec = await this.governanceFinalize
      .getHumanReviewStore()
      .get(reviewId, tenant.organizationId);
    if (!rec) return failure(new NotFoundError("review not found"));
    return success(this.toReviewDto(rec));
  }

  async listOsReviews(
    tenant: TenantContext | undefined,
    query?: { readonly status?: string; readonly limit?: number },
    options?: { readonly crossTenant?: boolean }
  ): Promise<Result<unknown>> {
    const statusRaw = String(query?.status ?? "PENDING").trim().toUpperCase();
    const status =
      statusRaw === "ALL" || statusRaw === "*"
        ? undefined
        : (statusRaw as
            | "PENDING"
            | "APPROVED"
            | "REJECTED"
            | "REQUEST_CHANGES");
    const limit = Number(query?.limit ?? 100);
    const organizationId =
      options?.crossTenant === true ? undefined : tenant?.organizationId;
    if (!options?.crossTenant && !organizationId) {
      return success([]);
    }
    const rows = await this.governanceFinalize.getHumanReviewStore().list({
      organizationId,
      status,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    return success(rows.map((r) => this.toReviewDto(r)));
  }

  async getOsPendingReview(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<unknown>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const rec = await this.governanceFinalize
      .getHumanReviewStore()
      .getPendingForExecution(executionId, tenant.organizationId);
    if (!rec) return success(null);
    return success(this.toReviewDto(rec));
  }

  private toArtifactDto(art: {
    artifactId: string;
    version: number;
    organizationId: string;
    executionId: string;
    checksum: string;
    approvalState: string;
    approvalReference?: string;
    preview?: string;
    planVersion?: number;
    createdAt: string;
  }) {
    return {
      artifactId: art.artifactId,
      version: art.version,
      organizationId: art.organizationId,
      executionId: art.executionId,
      checksum: art.checksum,
      approvalState: art.approvalState,
      approvalReference: art.approvalReference,
      planVersion: art.planVersion,
      createdAt: art.createdAt,
      preview: art.preview,
    };
  }

  private toDeliveryDto(r: {
    deliveryId: string;
    organizationId: string;
    artifactId: string;
    artifactVersion: number;
    executionId: string;
    destination: string;
    status: string;
    timestamp: string;
    idempotencyKey: string;
    externalReference?: string;
    failureReason?: string;
    approvalReference?: string;
  }) {
    return {
      deliveryId: r.deliveryId,
      organizationId: r.organizationId,
      artifactId: r.artifactId,
      artifactVersion: r.artifactVersion,
      executionId: r.executionId,
      destination: r.destination,
      status: r.status,
      timestamp: r.timestamp,
      idempotencyKey: r.idempotencyKey,
      externalReference: r.externalReference,
      failureReason: r.failureReason,
      approvalReference: r.approvalReference,
    };
  }

  private toReviewDto(r: {
    reviewId: string;
    organizationId: string;
    executionId: string;
    status: string;
    reason: string;
    requestedAt: string;
    reviewer?: string;
    comments?: string;
    decidedAt?: string;
    policyVersion: string;
  }) {
    return {
      reviewId: r.reviewId,
      organizationId: r.organizationId,
      executionId: r.executionId,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requestedAt,
      reviewer: r.reviewer,
      comments: r.comments,
      decidedAt: r.decidedAt,
      policyVersion: r.policyVersion,
      brand: r.reason?.slice(0, 80) || "Creative review",
      service: "AI Create Design",
      route: "AI",
      submittedAt: r.requestedAt,
    };
  }

  private mapOsError(err: unknown): Result<unknown> {
    if (err instanceof RefinementError || err instanceof DeliveryError) {
      if (String(err.code).includes("TENANT")) {
        return failure(new AuthorizationError(err.message));
      }
      if (String(err.code).includes("NOT_FOUND")) {
        return failure(new NotFoundError(err.message));
      }
      return failure(new ValidationError(err.message));
    }
    return failure(
      new ValidationError(err instanceof Error ? err.message : "os operation failed")
    );
  }

  private async persistExecution(resource: ExecutionResource): Promise<void> {
    this.executionStore.set(resource.executionId, resource);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(resource);
    }
  }

  /**
   * Create() may return while a sibling tick() still owns this job.
   * Polls must copy terminal job state (and artifact ids) onto the execution record.
   */
  private async hydrateFromDistributedJob(
    resource: ExecutionResource
  ): Promise<ExecutionResource> {
    const needsHydrate =
      resource.status === "queued" ||
      resource.status === "running" ||
      resource.status === "retrying" ||
      (resource.status === "succeeded" &&
        (resource.result?.kind === "pending" ||
          resource.result?.kind === "empty" ||
          resource.result == null ||
          missingWebsitePreview(resource)));
    if (!needsHydrate) return resource;

    if (this.deps.distributed && resource.jobId) {
      const readJob = () =>
        this.deps.distributed!.getJob(asJobId(resource.jobId!));
      let job = readJob();
      if (
        (!job.ok || !job.value || !isTerminalJobStatus(job.value.status)) &&
        this.deps.autoTick !== false
      ) {
        this.deps.distributed.registerWorker("execution", 4);
        await this.deps.distributed.tick(1).catch(() => undefined);
        job = readJob();
      }
      if (job.ok && job.value) {
        const summary = job.value.resultSummary ?? {};
        const status = mapJobStatus(job.value.status, summary);
        const mediaArtifactIds = jobMediaArtifactIds(summary);
        let nextResult = mergeExportArtifactsIntoResult({
          status,
          result: buildExecutionResultPayload({
            status,
            jobSummary: summary,
          }),
          jobSummary: summary,
          mediaArtifactIds,
        });
        const exported = await applyWebsiteExportToExecution({
          asyncMedia: this.deps.asyncMedia,
          executionId: resource.executionId,
          organizationId: resource.organizationId,
          status,
          jobSummary: summary,
          metadata: job.value.payload?.metadata,
          createId: this.deps.createId,
          currentResult: nextResult,
          currentArtifactIds:
            mediaArtifactIds.length > 0
              ? mediaArtifactIds
              : resource.artifactIds,
        });
        nextResult = exported.result;
        const nextArtifactIds = exported.artifactIds ?? resource.artifactIds;
        let nextStatus = status;
        let nextError =
          (typeof summary.errorMessage === "string"
            ? summary.errorMessage
            : undefined) ??
          job.value.lastError ??
          resource.errorMessage;
        if (
          exported.errorCode &&
          !exported.exported &&
          status === "succeeded"
        ) {
          const meta = job.value.payload?.metadata as
            | Readonly<Record<string, unknown>>
            | undefined;
          const websiteRequired =
            (typeof meta?.service === "string" &&
              meta.service.toLowerCase() === "website") ||
            (typeof meta?.outputKind === "string" &&
              /^(deferred_)?website$/i.test(meta.outputKind)) ||
            (meta?.structuredOutput &&
              typeof meta.structuredOutput === "object" &&
              /^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(
                String(
                  (meta.structuredOutput as { name?: unknown }).name ?? "",
                ),
              ));
          if (websiteRequired) {
            nextStatus = "failed";
            nextError =
              exported.errorCode ||
              "Could not build the website deliverable from the model output.";
          }
        }
        const unchanged =
          nextStatus === resource.status &&
          nextError === resource.errorMessage &&
          nextResult != null &&
          resource.result?.kind === nextResult.kind &&
          !exported.exported &&
          !missingWebsitePreview({ ...resource, result: nextResult });
        if (!unchanged) {
          return this.persistHydratedExecution({
            ...resource,
            status: nextStatus,
            completedAt: job.value.completedAt ?? resource.completedAt,
            errorMessage: nextError,
            artifactIds: nextArtifactIds,
            result: nextResult,
            cost: Number(summary.cost ?? resource.cost ?? 0) || resource.cost,
            evaluationScore:
              typeof summary.evaluationScore === "number"
                ? summary.evaluationScore
                : resource.evaluationScore,
            updatedAt: this.deps.nowIso(),
          });
        }
        if (nextResult.kind === "structured") return resource;
      }
    }

    const listed = this.deps.persistence
      ? await this.deps.persistence.artifacts.list(resource.executionId)
      : this.artifactStore.get(resource.executionId) ?? [];
    const media = listed.filter(
      (row) => row.kind === "media" || row.label?.startsWith("blob:")
    );
    if (media.length === 0) return resource;
    if (resource.result?.kind === "structured") return resource;
    const artifactIds = media.map((row) => row.artifactId);
    const jobId = resource.jobId;
    if (jobId && this.deps.distributed) {
      const job = this.deps.distributed.getJob(asJobId(jobId));
      if (job.ok && job.value?.resultSummary) {
        const merged = mergeExportArtifactsIntoResult({
          status: "succeeded",
          result: buildExecutionResultPayload({
            status: "succeeded",
            jobSummary: job.value.resultSummary,
          }),
          jobSummary: job.value.resultSummary,
          mediaArtifactIds: artifactIds,
        });
        if (merged.kind === "structured") {
          return this.persistHydratedExecution({
            ...resource,
            status: "succeeded",
            completedAt: resource.completedAt ?? this.deps.nowIso(),
            artifactIds,
            result: merged,
            updatedAt: this.deps.nowIso(),
          });
        }
      }
    }
    return this.persistHydratedExecution({
      ...resource,
      status: "succeeded",
      completedAt: resource.completedAt ?? this.deps.nowIso(),
      artifactIds,
      result: { kind: "artifact", data: { artifactIds } },
      updatedAt: this.deps.nowIso(),
    });
  }

  private async persistHydratedExecution(
    resource: ExecutionResource
  ): Promise<ExecutionResource> {
    this.executionStore.set(resource.executionId, resource);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(resource);
    }
    return resource;
  }

  private async loadExecution(executionId: string): Promise<ExecutionResource | undefined> {
    // Prefer persistence when present — AsyncExecutionCoordinator updates the
    // durable/in-memory repository, not ExecutionApiService.executionStore.
    if (this.deps.persistence) {
      const persisted = await this.deps.persistence.executions.get(executionId);
      if (persisted) {
        this.executionStore.set(executionId, persisted);
        return persisted;
      }
    }
    return this.executionStore.get(executionId);
  }

  private async scoped(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const exec = await this.loadExecution(executionId);
    if (!exec) return failure(new NotFoundError("execution not found"));
    if (exec.organizationId !== tenant.organizationId) {
      return failure(new AuthorizationError("tenant isolation violation"));
    }
    return success(exec);
  }
}

function missingWebsitePreview(resource: ExecutionResource): boolean {
  const data =
    resource.result?.data && typeof resource.result.data === "object"
      ? (resource.result.data as Record<string, unknown>)
      : undefined;
  const html = typeof data?.html === "string" ? data.html.trim() : "";
  const htmlArtifactId =
    typeof data?.htmlArtifactId === "string" ? data.htmlArtifactId.trim() : "";
  const projectArtifactId =
    typeof data?.projectArtifactId === "string"
      ? data.projectArtifactId.trim()
      : "";
  const hasFiles = Array.isArray(data?.files) && data.files.length > 0;
  if (html || htmlArtifactId || projectArtifactId || hasFiles) return false;
  const text =
    typeof resource.result?.text === "string" ? resource.result.text : "";
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(text)) return true;
  return data?.exportKind === "website";
}

function isTerminalJobStatus(status: string): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "dead_letter"
  );
}

function jobMediaArtifactIds(
  summary: Readonly<Record<string, unknown>>
): string[] {
  return Array.isArray(summary.mediaArtifactIds)
    ? summary.mediaArtifactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
}
